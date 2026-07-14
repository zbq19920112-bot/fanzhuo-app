const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];

// ===== 内存版Supabase stub（共享"云端"，模拟两台设备两个账号） =====
const cloudDB={households:[],household_members:[],fridge_items:[],plan_entries:[],purchased_items:[],ratings:[],custom_dishes:[]};
let idSeq=1;
const rtSubs=[]; // {table,filter,cb}
function notify(table){rtSubs.forEach(s=>{if(s.table===table)setImmediate(()=>s.cb({}));});}
function rowMatch(row,cond){return Object.keys(cond).every(k=>String(row[k])===String(cond[k]));}
function makeSupabaseStub(userId,email){
  const session=userId?{user:{id:userId,email}}:null;
  return {
    auth:{
      _session:session,
      async getSession(){return {data:{session:this._session}};},
      onAuthStateChange(cb){this._cb=cb;},
      async signInWithOtp({email}){this._otpTo=email;return {error:null};},
      async signOut(){this._session=null;return {error:null};},
    },
    async rpc(name,args){
      const uid=this.auth._session&&this.auth._session.user.id;
      if(!uid)return {data:null,error:{message:'not_authenticated'}};
      if(name==='create_household'){
        const code='INV'+(idSeq+100);const hid='hh-'+(idSeq++);
        cloudDB.households.push({id:hid,invite_code:code});
        cloudDB.household_members.push({household_id:hid,user_id:uid});
        return {data:[{household_id:hid,invite_code:code}],error:null};
      }
      if(name==='join_household'){
        const hh=cloudDB.households.find(h=>h.invite_code===String(args.code).toUpperCase().trim());
        if(!hh)return {data:null,error:{message:'invalid_code'}};
        const members=cloudDB.household_members.filter(m=>m.household_id===hh.id);
        if(members.length>=2&&!members.find(m=>m.user_id===uid))return {data:null,error:{message:'household_full'}};
        if(!members.find(m=>m.user_id===uid))cloudDB.household_members.push({household_id:hh.id,user_id:uid});
        return {data:hh.id,error:null};
      }
      if(name==='my_household'){
        const m=cloudDB.household_members.find(m=>m.user_id===uid);
        if(!m)return {data:[],error:null};
        const hh=cloudDB.households.find(h=>h.id===m.household_id);
        const cnt=cloudDB.household_members.filter(x=>x.household_id===hh.id).length;
        return {data:[{household_id:hh.id,invite_code:hh.invite_code,member_count:cnt}],error:null};
      }
      return {data:null,error:{message:'unknown rpc'}};
    },
    from(table){
      const rows=cloudDB[table];
      return {
        select(){return {eq:async(col,val)=>({data:JSON.parse(JSON.stringify(rows.filter(r=>String(r[col])===String(val)))),error:null})};},
        async insert(obj){const r=Object.assign({},obj);if(table==='fridge_items'&&!r.id)r.id='fi-'+(idSeq++);rows.push(r);notify(table);return {error:null};},
        async upsert(obj){
          const keyCols={plan_entries:['household_id','day','meal','dish_id'],purchased_items:['household_id','name'],ratings:['household_id','user_id','dish_id']}[table];
          if(keyCols){const cond={};keyCols.forEach(k=>cond[k]=obj[k]);
            const ex=rows.find(r=>rowMatch(r,cond));
            if(ex)Object.assign(ex,obj);else rows.push(Object.assign({},obj));
          }else rows.push(Object.assign({},obj));
          notify(table);return {error:null};
        },
        update(patch){return {eq:async(col,val)=>{rows.forEach(r=>{if(String(r[col])===String(val))Object.assign(r,patch);});notify(table);return {error:null};}};},
        delete(){return {
          match:async cond=>{for(let i=rows.length-1;i>=0;i--)if(rowMatch(rows[i],cond))rows.splice(i,1);notify(table);return {error:null};},
          eq:async(col,val)=>{for(let i=rows.length-1;i>=0;i--)if(String(rows[i][col])===String(val))rows.splice(i,1);notify(table);return {error:null};},
        };},
      };
    },
    channel(){return {
      _binds:[],
      on(ev,opt,cb){this._binds.push({table:opt.table,cb});return this;},
      subscribe(){this._binds.forEach(b=>rtSubs.push(b));return this;},
    };},
  };
}
const tick=()=>new Promise(r=>setTimeout(r,5));
async function settle(n=10){for(let i=0;i<n;i++)await tick();}
async function settleRT(){await new Promise(r=>setTimeout(r,350));await settle(4);} // 等待实时防抖(250ms)

function makeDevice(userId,email,configured=true){
  const store={};
  const LS={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const registry={};
  function makeEl(id){const el={id,_html:'',value:'',_classes:new Set(),
    classList:{add:c=>el._classes.add(c),remove:c=>el._classes.delete(c),contains:c=>el._classes.has(c),
      toggle:(c,f)=>{if(f===undefined)f=!el._classes.has(c);f?el._classes.add(c):el._classes.delete(c);return f;}},
    querySelector:()=>{if(!el._lbl)el._lbl={textContent:''};return el._lbl;},
    get innerHTML(){return el._html;},
    set innerHTML(v){el._html=v;for(const m of v.matchAll(/id="([^"]+)"/g)){if(!registry[m[1]])registry[m[1]]=makeEl(m[1]);}},
    get textContent(){return el._html.replace(/<[^>]*>/g,'');},
    set textContent(v){el._html=String(v);}};return el;}
  ['u-me','u-partner','toast','h-title','h-sub','h-sync','btn-lang','btn-reset','detail','adddish','pairing',
   'page-plan','page-dishes','page-fridge','page-shopping','page-suggest',
   'tab-plan','tab-dishes','tab-fridge','tab-shopping','tab-suggest'].forEach(id=>registry[id]=makeEl(id));
  const sbStub=makeSupabaseStub(userId,email);
  const ctx={document:{getElementById:id=>registry[id]||null},setTimeout,clearTimeout,console,
    localStorage:LS,BroadcastChannel:function(){this.postMessage=()=>{};},confirm:()=>true,
    fetch:()=>Promise.reject(new Error('no')),open:()=>{},
    APP_CONFIG:configured?{SUPABASE_URL:'https://stub.supabase.co',SUPABASE_ANON_KEY:'stub-key'}:{SUPABASE_URL:'',SUPABASE_ANON_KEY:''},
    supabase:{createClient:()=>sbStub}};
  ctx.window=ctx;vm.createContext(ctx);
  vm.runInContext(script+';this.state=state;this.cloud=cloud;',ctx);
  return {ctx,registry,store,sb:sbStub};
}

let pass=0,fail=0;
const t=(n,c)=>{c?(pass++,console.log('✅ '+n)):(fail++,console.log('❌ '+n))};

(async()=>{
  // ===== 未登录设备 =====
  const W=makeDevice('wife-uid','wife@example.com');
  await settle();
  // 初始未登录？stub在构造时就有session（模拟已点过魔法链接回来）
  t('已登录但无小家 → 状态提示创建', W.registry['h-sync'].textContent.includes('创建或加入'));
  t('自动弹出云端面板', W.registry['pairing'].classList.contains('open'));
  t('云模式下无demo种子数据', W.ctx.state.fridge.length===0);
  t('云模式隐藏TA切换按钮', W.registry['u-partner'].classList.contains('hidden'));

  // ===== 妻子创建小家 =====
  await W.ctx.hhCreate(); await settle();
  const invite=W.ctx.cloud.invite;
  t('创建小家得到邀请码', !!invite && W.ctx.cloud.hid);
  t('状态栏显示云同步中', W.registry['h-sync'].textContent.includes('云同步中'));
  t('面板显示邀请码+TA未加入', W.registry['pairing'].textContent.includes(invite));

  // ===== 妻子录入数据 =====
  W.registry['f-name'].value='鸡蛋';W.registry['f-qty'].value='6';W.registry['f-unit'].value='个';
  W.ctx.addFridge(); await settle();
  t('冰箱写入云端', cloudDB.fridge_items.length===1 && cloudDB.fridge_items[0].n==='鸡蛋');
  t('拉回真值带行id', W.ctx.state.fridge[0]._id);

  W.ctx.state.activeDay='周一';W.ctx.renderAll();
  W.registry['sel-晚餐'].value='d1';W.ctx.addDish('周一','晚餐'); await settle();
  t('菜单写入云端', cloudDB.plan_entries.some(r=>r.dish_id==='d1'));

  W.ctx.setRating('d1','me',5); await settle();
  t('评分按用户id存行', cloudDB.ratings.some(r=>r.user_id==='wife-uid'&&r.rating===5));

  // ===== 丈夫设备加入 =====
  const H=makeDevice('husband-uid','husband@example.com');
  await settle();
  H.registry['hh-code'].value=invite.toLowerCase();
  await H.ctx.hhJoin(); await settle();
  t('丈夫用邀请码加入', H.ctx.cloud.hid===W.ctx.cloud.hid);
  t('加入后拉到妻子的数据', H.ctx.state.fridge.some(i=>i.n==='鸡蛋') && H.ctx.state.plan['周一']['晚餐'].includes('d1'));
  t('妻子的评分显示为丈夫端的partner', H.ctx.state.ratings.partner['d1']===5);

  // ===== 实时同步 =====
  H.ctx.setRating('d1','me',3); await settleRT();
  t('丈夫评分实时到妻子端（为partner）', W.ctx.state.ratings.partner['d1']===3);
  t('两人评分互不覆盖（云端2行）', cloudDB.ratings.length===2);
  t('平均分计算=4.0', W.ctx.avgRating('d1')===4);

  W.ctx.togglePurchase('番茄'); await settleRT();
  t('妻子打勾实时到丈夫端', H.ctx.state.purchased['番茄']===true);

  // 自建菜跨账号
  H.ctx.openAddDish();
  H.registry['ad-name'].value='凉拌黄瓜';H.registry['ad-cuisine'].value='中餐';
  H.registry['ad-text'].value='用料\n黄瓜 2根\n做法\n1. 拍碎拌匀';
  H.ctx.saveCustomDish(); await settleRT();
  t('丈夫自建菜到云端并同步妻子端', W.ctx.state.customDishes.some(d=>d.name==='凉拌黄瓜'));

  // 字段级不覆盖：两人同时改不同域
  W.registry['f-name'].value='牛奶';W.registry['f-qty'].value='1';W.registry['f-unit'].value='盒';
  W.ctx.addFridge();
  H.ctx.setRating('d5','me',4);
  await settleRT();
  t('并发修改互不覆盖（冰箱2条+评分3行）', cloudDB.fridge_items.length===2 && cloudDB.ratings.length===3);
  t('双端最终一致', H.ctx.state.fridge.length===2 && W.ctx.state.ratings.partner['d5']===4);

  // 满员拦截
  const X=makeDevice('intruder-uid','x@example.com'); await settle();
  X.registry['hh-code']=X.registry['hh-code']||{value:''};
  X.ctx.openPairing(); X.registry['hh-code'].value=invite;
  await X.ctx.hhJoin(); await settle();
  t('第三人加入被拒（满员）', X.ctx.cloud.hid==null);

  // 购物入库流程
  W.ctx.togglePurchase('葱'); await settleRT();
  W.ctx.stockPurchased(); await settleRT();
  t('打勾入库：云端冰箱有葱、purchased清空', cloudDB.fridge_items.some(r=>r.n==='葱') && cloudDB.purchased_items.length===0);

  // 清空云端
  W.ctx.clearCloudData(); await settleRT();
  t('清空整组云端数据', cloudDB.fridge_items.length===0 && cloudDB.ratings.length===0 && cloudDB.plan_entries.length===0);
  t('丈夫端也被清空', H.ctx.state.fridge.length===0);

  // 登出
  await W.ctx.doLogout(); await settle();
  t('登出后回到登录界面', !W.ctx.cloud.session && W.registry['pairing'].textContent.includes('邮箱'));

  // ===== 本地演示模式（无配置） =====
  const L=makeDevice(null,null,false); await settle();
  t('无配置→本地演示模式提示', L.registry['h-sync'].textContent.includes('本地演示'));
  t('本地模式有demo种子数据', L.ctx.state.fridge.length===11);
  t('本地模式保留TA切换', !L.registry['u-partner'].classList.contains('hidden'));
  L.ctx.togglePurchase('咖喱块');
  t('本地模式localStorage持久化', !!L.store['mp_state_v2']);
  t('本地模式核心逻辑回归', L.ctx.isReadyToCook(L.ctx.getDish('d1'),L.ctx.state.fridge,{}));

  console.log(`\nv6-UAT: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
