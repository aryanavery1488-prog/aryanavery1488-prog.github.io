const ORIGIN="https://aryanavery1488-prog.github.io",DAYS=90,SIZE=200;
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{...H,...h}});
const cors=o=>({"Access-Control-Allow-Origin":o,"Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Vary":"Origin"});
const clean=(v,n=1500)=>typeof v==="string"?v.slice(0,n):null;
const valid=id=>typeof id==="string"&&/^v_[a-zA-Z0-9-]{10,100}$/.test(id);
const admin=(r,e)=>!!e.ADMIN_TOKEN&&(r.headers.get("Authorization")||"")==="Bearer "+e.ADMIN_TOKEN;
function obj(v,max=6000){try{if(!v||typeof v!=="object"||Array.isArray(v))return{};const s=JSON.stringify(v);return s.length<=max?JSON.parse(s):{}}catch(_){return{}}}
async function body(r,max=12000){const s=await r.text();if(new TextEncoder().encode(s).length>max)throw 1;try{return JSON.parse(s)}catch(_){throw 2}}
function cursor(a,b){return btoa(a+"\n"+b)}
function decode(v){try{const p=atob(v).split("\n");return p.length===2&&valid(p[1])?{a:p[0],b:p[1]}:null}catch(_){return null}}
function record(r){let m={};try{m=JSON.parse(r.metadata_json||"{}")}catch(_){}return{visitor_id:r.visitor_id,first_seen:r.first_seen,last_seen:r.last_seen,visits:r.visits,ip_address:r.ip_address,user_agent:r.user_agent,page:r.page,referrer:r.referrer,language:r.language,timezone:r.timezone,screen:{width:r.screen_width,height:r.screen_height},notice_shown:!!r.notice_shown,metadata:m,retention_expires_at:r.retention_expires_at}}
export default{async fetch(req,env){
const o=req.headers.get("Origin")||"";if(o!==ORIGIN)return json({error:"Origin not allowed"},403);const h=cors(o);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});if(!env.DB)return json({error:"D1 binding DB is missing"},503,h);
const u=new URL(req.url);try{
if(u.pathname==="/api/health"&&req.method==="GET"){await env.DB.prepare("SELECT 1").first();return json({status:"healthy",database:"connected"},200,h)}
if(u.pathname==="/api/visit"&&req.method==="POST"){
let b;try{b=await body(req)}catch(_){return json({error:"Invalid or oversized JSON"},400,h)}
if(!valid(b.visitor_id)||b.first_party_notice!==true)return json({error:"Notice acknowledgement required"},400,h);
const now=new Date().toISOString(),exp=new Date(Date.now()+DAYS*86400000).toISOString(),ip=clean(req.headers.get("CF-Connecting-IP"),64),ua=clean(req.headers.get("User-Agent"),500),w=Number.isInteger(b.screen?.width)?Math.min(20000,Math.max(0,b.screen.width)):null,ht=Number.isInteger(b.screen?.height)?Math.min(20000,Math.max(0,b.screen.height)):null;
await env.DB.prepare(`INSERT INTO visitors(visitor_id,first_seen,last_seen,visits,ip_address,user_agent,page,referrer,language,timezone,screen_width,screen_height,notice_shown,metadata_json,retention_expires_at) VALUES(?,?,?,1,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen=excluded.last_seen,visits=MIN(visitors.visits+1,1000000),ip_address=excluded.ip_address,user_agent=excluded.user_agent,page=excluded.page,referrer=excluded.referrer,language=excluded.language,timezone=excluded.timezone,screen_width=excluded.screen_width,screen_height=excluded.screen_height,notice_shown=1,metadata_json=excluded.metadata_json,retention_expires_at=excluded.retention_expires_at`).bind(b.visitor_id,now,now,ip,ua,clean(b.page),clean(b.referrer),clean(b.language,50),clean(b.timezone,100),w,ht,JSON.stringify(obj(b.metadata)),exp).run();
return json({ok:true},200,h)}
if(u.pathname==="/api/event"&&req.method==="POST"){
let b;try{b=await body(req,8000)}catch(_){return json({error:"Invalid or oversized JSON"},400,h)}
if(!valid(b.visitor_id)||b.first_party_notice!==true)return json({error:"Notice acknowledgement required"},400,h);
const types=["page_view","page_exit","tab_hidden","tab_visible","ui_click","javascript_error","unhandled_rejection","resource_error","browser_details"];if(!types.includes(b.event_type))return json({error:"Unsupported event"},400,h);
const dur=Number.isInteger(b.duration_ms)?Math.min(86400000,Math.max(0,b.duration_ms)):null;
await env.DB.prepare("INSERT INTO visitor_events(visitor_id,session_id,event_type,page,occurred_at,duration_ms,details_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM visitors WHERE visitor_id=?)").bind(b.visitor_id,typeof b.session_id==="string"?clean(b.session_id,110):null,b.event_type,clean(b.page),new Date().toISOString(),dur,JSON.stringify(obj(b.details,3000)),b.visitor_id).run();
return json({ok:true},200,h)}
if(u.pathname.startsWith("/api/admin/")){
if(!admin(req,env))return json({error:"Unauthorized"},401,h);
if(u.pathname==="/api/admin/visitors"&&req.method==="GET"){
const cv=u.searchParams.get("cursor"),c=cv?decode(cv):null;if(cv&&!c)return json({error:"Invalid cursor"},400,h);
const since=new Date(Date.now()-86400000).toISOString(),stats=await env.DB.prepare("SELECT COUNT(*) unique_visitors,COALESCE(SUM(visits),0) total_visits,COALESCE(SUM(CASE WHEN first_seen>=? THEN 1 ELSE 0 END),0) new_last_24h,COALESCE(SUM(CASE WHEN last_seen>=? THEN 1 ELSE 0 END),0) active_last_24h,(SELECT COUNT(*) FROM visitor_events) total_events FROM visitors").bind(since,since).first();
const q=c?env.DB.prepare("SELECT * FROM visitors WHERE last_seen<? OR(last_seen=? AND visitor_id<?) ORDER BY last_seen DESC,visitor_id DESC LIMIT ?").bind(c.a,c.a,c.b,SIZE+1):env.DB.prepare("SELECT * FROM visitors ORDER BY last_seen DESC,visitor_id DESC LIMIT ?").bind(SIZE+1);
const rows=(await q.all()).results||[],more=rows.length>SIZE,p=rows.slice(0,SIZE),last=p[p.length-1];return json({stats,visitors:p.map(record),next_cursor:more&&last?cursor(last.last_seen,last.visitor_id):null},200,h)}
const em=u.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})\/events$/);
if(em&&req.method==="GET"){const rows=(await env.DB.prepare("SELECT id,session_id,event_type,page,occurred_at,duration_ms,details_json FROM visitor_events WHERE visitor_id=? ORDER BY occurred_at DESC LIMIT 500").bind(em[1]).all()).results||[];return json({events:rows.map(x=>({id:x.id,session_id:x.session_id,event_type:x.event_type,page:x.page,occurred_at:x.occurred_at,duration_ms:x.duration_ms,details:obj(JSON.parse(x.details_json||"{}"))}))},200,h)}
const dm=u.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})$/);if(dm&&req.method==="DELETE"){await env.DB.prepare("DELETE FROM visitor_events WHERE visitor_id=?").bind(dm[1]).run();await env.DB.prepare("DELETE FROM visitors WHERE visitor_id=?").bind(dm[1]).run();return json({ok:true},200,h)}
}
return json({error:"Not found"},404,h)
}catch(_){return json({error:"Internal server error"},500,h)}
},async scheduled(c,e,ctx){if(e.DB){const cutoff=new Date(Date.now()-DAYS*86400000).toISOString();ctx.waitUntil(Promise.all([e.DB.prepare("DELETE FROM visitors WHERE retention_expires_at<=?").bind(new Date().toISOString()).run(),e.DB.prepare("DELETE FROM visitor_events WHERE occurred_at<=?").bind(cutoff).run()]))}}};