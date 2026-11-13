const ORIGIN="https://aryanavery1488-prog.github.io",DAYS=90,MAX_PAGE=200;
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{...H,...h}});
const cors=o=>({"Access-Control-Allow-Origin":o,"Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Vary":"Origin"});
const clean=(v,n=1500)=>typeof v==="string"?v.slice(0,n):null;
const valid=id=>typeof id==="string"&&/^v_[a-zA-Z0-9-]{10,100}$/.test(id);
const admin=(r,e)=>!!e.ADMIN_TOKEN&&(r.headers.get("Authorization")||"")==="Bearer "+e.ADMIN_TOKEN;
function obj(v,max=6000){try{if(!v||typeof v!=="object"||Array.isArray(v))return{};const s=JSON.stringify(v);return s.length<=max?JSON.parse(s):{}}catch(_){return{}}}
async function body(r,max=12000){const s=await r.text();if(new TextEncoder().encode(s).length>max)throw 1;try{return JSON.parse(s)}catch(_){throw 2}}
function record(r){let m={};try{m=JSON.parse(r.metadata_json||"{}")}catch(_){}return{visitor_id:r.visitor_id,first_seen:r.first_seen,last_seen:r.last_seen,visits:r.visits,ip_address:r.ip_address,user_agent:r.user_agent,page:r.page,referrer:r.referrer,language:r.language,timezone:r.timezone,screen:{width:r.screen_width,height:r.screen_height},location:{country:r.geo_country,region:r.geo_region,city:r.geo_city},network:{asn:r.network_asn,edge_colo:r.edge_colo},notice_shown:!!r.notice_shown,metadata:m,retention_expires_at:r.retention_expires_at}}
export default{async fetch(req,env){
const origin=req.headers.get("Origin")||"";if(origin!==ORIGIN)return json({error:"Origin not allowed"},403);const h=cors(origin);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});if(!env.DB)return json({error:"D1 binding DB is missing"},503,h);
const u=new URL(req.url);try{
if(u.pathname==="/api/health"&&req.method==="GET"){await env.DB.prepare("SELECT 1").first();return json({status:"healthy",database:"connected"},200,h)}
if(u.pathname==="/api/visit"&&req.method==="POST"){
let b;try{b=await body(req)}catch(_){return json({error:"Invalid or oversized JSON"},400,h)}
if(!valid(b.visitor_id)||b.first_party_notice!==true)return json({error:"Notice acknowledgement required"},400,h);
const now=new Date().toISOString(),exp=new Date(Date.now()+DAYS*86400000).toISOString(),ip=clean(req.headers.get("CF-Connecting-IP"),64),ua=clean(req.headers.get("User-Agent"),500),w=Number.isInteger(b.screen?.width)?Math.min(20000,Math.max(0,b.screen.width)):null,ht=Number.isInteger(b.screen?.height)?Math.min(20000,Math.max(0,b.screen.height)):null,cf=req.cf||{};
await env.DB.prepare("INSERT INTO visitors(visitor_id,first_seen,last_seen,visits,ip_address,user_agent,page,referrer,language,timezone,screen_width,screen_height,notice_shown,metadata_json,retention_expires_at,geo_country,geo_region,geo_city,network_asn,edge_colo) VALUES(?,?,?,1,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen=excluded.last_seen,visits=MIN(visitors.visits+1,1000000),ip_address=excluded.ip_address,user_agent=excluded.user_agent,page=excluded.page,referrer=excluded.referrer,language=excluded.language,timezone=excluded.timezone,screen_width=excluded.screen_width,screen_height=excluded.screen_height,notice_shown=1,metadata_json=excluded.metadata_json,retention_expires_at=excluded.retention_expires_at,geo_country=excluded.geo_country,geo_region=excluded.geo_region,geo_city=excluded.geo_city,network_asn=excluded.network_asn,edge_colo=excluded.edge_colo").bind(b.visitor_id,now,now,ip,ua,clean(b.page),clean(b.referrer),clean(b.language,50),clean(b.timezone,100),w,ht,JSON.stringify(obj(b.metadata)),exp,clean(cf.country,8),clean(cf.region,100),clean(cf.city,100),Number.isInteger(cf.asn)?cf.asn:null,clean(cf.colo,12)).run();
return json({ok:true},200,h)}
if(u.pathname==="/api/event"&&req.method==="POST"){
let b;try{b=await body(req,8000)}catch(_){return json({error:"Invalid or oversized JSON"},400,h)}
if(!valid(b.visitor_id)||b.first_party_notice!==true)return json({error:"Notice acknowledgement required"},400,h);
const types=["page_view","page_exit","tab_hidden","tab_visible","ui_click","javascript_error","unhandled_rejection","resource_error","browser_details","page_performance","network_change","api_error","web_vital","scroll_depth"];
if(!types.includes(b.event_type))return json({error:"Unsupported event"},400,h);
const dur=Number.isInteger(b.duration_ms)?Math.min(86400000,Math.max(0,b.duration_ms)):null;
await env.DB.prepare("INSERT INTO visitor_events(visitor_id,session_id,event_type,page,occurred_at,duration_ms,details_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM visitors WHERE visitor_id=?)").bind(b.visitor_id,typeof b.session_id==="string"?clean(b.session_id,110):null,b.event_type,clean(b.page),new Date().toISOString(),dur,JSON.stringify(obj(b.details,3000)),b.visitor_id).run();
return json({ok:true},200,h)}
if(u.pathname.startsWith("/api/admin/")){
if(!admin(req,env))return json({error:"Unauthorized"},401,h);
if(u.pathname==="/api/admin/visitors"&&req.method==="GET"){
const q=clean(u.searchParams.get("q"),120),country=clean(u.searchParams.get("country"),8),device=clean(u.searchParams.get("device"),40),os=clean(u.searchParams.get("os"),80),from=clean(u.searchParams.get("from"),30),to=clean(u.searchParams.get("to"),30),sort=u.searchParams.get("sort")||"last_seen",dir=u.searchParams.get("dir")==="asc"?"ASC":"DESC",allowed={last_seen:"last_seen",first_seen:"first_seen",visits:"visits"},order=allowed[sort]||"last_seen",limit=Math.min(MAX_PAGE,Math.max(1,Number(u.searchParams.get("limit"))||100)),offset=Math.min(1000000,Math.max(0,Number(u.searchParams.get("offset"))||0));
let where=[],args=[];if(q){where.push("(visitor_id LIKE ? OR ip_address LIKE ? OR user_agent LIKE ? OR geo_city LIKE ? OR geo_region LIKE ? OR geo_country LIKE ? OR CAST(network_asn AS TEXT) LIKE ?)");for(let i=0;i<7;i++)args.push("%"+q+"%")}
if(country){where.push("geo_country=?");args.push(country)}if(device){where.push("json_extract(metadata_json,'$.device.category')=?");args.push(device)}if(os){where.push("json_extract(metadata_json,'$.system.name')=?");args.push(os)}if(from){where.push("first_seen>=?");args.push(from+"T00:00:00.000Z")}if(to){where.push("first_seen<=?");args.push(to+"T23:59:59.999Z")}
const clause=where.length?" WHERE "+where.join(" AND "):"",stats=await env.DB.prepare("SELECT COUNT(*) unique_visitors,COALESCE(SUM(visits),0) total_visits FROM visitors"+clause).bind(...args).first();
const rows=(await env.DB.prepare("SELECT * FROM visitors"+clause+" ORDER BY "+order+" "+dir+",visitor_id ASC LIMIT ? OFFSET ?").bind(...args,limit,offset).all()).results||[];
return json({stats,visitors:rows.map(record),offset,next_offset:rows.length===limit?offset+rows.length:null},200,h)}
if(u.pathname==="/api/admin/analytics"&&req.method==="GET"){
const since=new Date(Date.now()-30*86400000).toISOString();
const [pages,events,countries,browsers,devices,systems,campaigns,referrers,sessions,errors,vitals,scrolls]=await Promise.all([
env.DB.prepare("SELECT page,COUNT(*) views,COUNT(DISTINCT visitor_id) visitors FROM visitor_events WHERE event_type='page_view' AND occurred_at>=? GROUP BY page ORDER BY views DESC LIMIT 12").bind(since).all(),
env.DB.prepare("SELECT event_type,COUNT(*) total FROM visitor_events WHERE occurred_at>=? GROUP BY event_type ORDER BY total DESC").bind(since).all(),
env.DB.prepare("SELECT COALESCE(geo_country,'Unknown') country,COUNT(*) visitors FROM visitors GROUP BY geo_country ORDER BY visitors DESC LIMIT 12").all(),
env.DB.prepare("SELECT COALESCE(json_extract(metadata_json,'$.browser.name'),'Unknown') browser,COUNT(*) visitors FROM visitors GROUP BY browser ORDER BY visitors DESC LIMIT 10").all(),
env.DB.prepare("SELECT COALESCE(json_extract(metadata_json,'$.device.category'),'Unknown') device,COUNT(*) visitors FROM visitors GROUP BY device ORDER BY visitors DESC LIMIT 10").all(),
env.DB.prepare("SELECT COALESCE(json_extract(metadata_json,'$.system.name'),'Unknown') os,COUNT(*) visitors FROM visitors GROUP BY os ORDER BY visitors DESC LIMIT 10").all(),
env.DB.prepare("SELECT COALESCE(json_extract(details_json,'$.utm.source'),'Direct / none') source,COUNT(*) visits FROM visitor_events WHERE event_type='page_view' AND occurred_at>=? GROUP BY source ORDER BY visits DESC LIMIT 10").bind(since).all(),
env.DB.prepare("SELECT COALESCE(referrer,'Direct / none') referrer,COUNT(*) visitors FROM visitors GROUP BY referrer ORDER BY visitors DESC LIMIT 10").all(),
env.DB.prepare("SELECT COUNT(DISTINCT session_id) sessions,COUNT(*) page_exits,COALESCE(AVG(duration_ms),0) avg_page_duration_ms FROM visitor_events WHERE event_type='page_exit' AND occurred_at>=?").bind(since).first(),
env.DB.prepare("SELECT event_type,COUNT(*) total FROM visitor_events WHERE event_type IN ('javascript_error','unhandled_rejection','resource_error','api_error') AND occurred_at>=? GROUP BY event_type").bind(since).all(),
env.DB.prepare("SELECT COALESCE(json_extract(details_json,'$.name'),'Unknown') name,ROUND(AVG(CAST(json_extract(details_json,'$.value') AS REAL)),1) average,COUNT(*) samples FROM visitor_events WHERE event_type='web_vital' AND occurred_at>=? GROUP BY name ORDER BY name").bind(since).all(),
env.DB.prepare("SELECT COALESCE(json_extract(details_json,'$.milestone'),'Unknown') milestone,COUNT(*) total FROM visitor_events WHERE event_type='scroll_depth' AND occurred_at>=? GROUP BY milestone ORDER BY milestone").bind(since).all()
]);
return json({period_days:30,top_pages:pages.results||[],event_counts:events.results||[],countries:countries.results||[],browsers:browsers.results||[],devices:devices.results||[],systems:systems.results||[],campaigns:campaigns.results||[],referrers:referrers.results||[],sessions:sessions||{},errors:errors.results||[],web_vitals:vitals.results||[],scroll_depth:scrolls.results||[]},200,h)}
const em=u.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})\/events$/);
if(em&&req.method==="GET"){const rows=(await env.DB.prepare("SELECT id,session_id,event_type,page,occurred_at,duration_ms,details_json FROM visitor_events WHERE visitor_id=? ORDER BY occurred_at DESC LIMIT 500").bind(em[1]).all()).results||[];return json({events:rows.map(x=>({id:x.id,session_id:x.session_id,event_type:x.event_type,page:x.page,occurred_at:x.occurred_at,duration_ms:x.duration_ms,details:obj(JSON.parse(x.details_json||"{}"))}))},200,h)}
const dm=u.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})$/);if(dm&&req.method==="DELETE"){await env.DB.prepare("DELETE FROM visitor_events WHERE visitor_id=?").bind(dm[1]).run();await env.DB.prepare("DELETE FROM visitors WHERE visitor_id=?").bind(dm[1]).run();return json({ok:true},200,h)}
}
return json({error:"Not found"},404,h)
}catch(e){return json({error:"Internal server error"},500,h)}
},async scheduled(c,e,ctx){if(e.DB){const now=new Date().toISOString();ctx.waitUntil(Promise.all([e.DB.prepare("DELETE FROM visitors WHERE retention_expires_at<=?").bind(now).run(),e.DB.prepare("DELETE FROM visitor_events WHERE occurred_at<=?").bind(new Date(Date.now()-DAYS*86400000).toISOString()).run()]))}}};