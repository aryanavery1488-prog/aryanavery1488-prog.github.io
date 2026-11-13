(()=>{"use strict";
const API="https://visitor-indexer.aryanavery1488.workers.dev",KEY="visitor_index_id_v1";
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
let vid;try{vid=localStorage.getItem(KEY)||"v_"+uid();localStorage.setItem(KEY,vid)}catch(_){vid="v_"+uid()}
const sid="s_"+uid(),ua=navigator.userAgentData||null,cn=navigator.connection||null;
const clean=v=>{try{const u=new URL(v,location.href);return u.origin+u.pathname}catch(_){return null}};
const params=new URLSearchParams(location.search),utm={};["source","medium","campaign","term","content"].forEach(k=>{const v=params.get("utm_"+k);if(v)utm[k]=v.slice(0,100)});
const agent=navigator.userAgent||"",platform=ua?.platform||navigator.platform||"";
const system=/Windows/i.test(agent)?"Windows":/Android/i.test(agent)?"Android":/iPhone|iPad|iPod/i.test(agent)?"iOS":/Mac OS|Macintosh/i.test(agent)?"macOS":/Linux/i.test(agent)?"Linux":"Other";
const browser=/Edg\//i.test(agent)?"Edge":/OPR\//i.test(agent)?"Opera":/Firefox\//i.test(agent)?"Firefox":/CriOS|Chrome\//i.test(agent)?"Chrome":/Safari\//i.test(agent)?"Safari":"Other";
const mobile=ua?.mobile??/Android|iPhone|iPad|Mobile/i.test(agent),category=mobile?"mobile":/iPad|Tablet/i.test(agent)?"tablet":"desktop";
const meta={device:{category,platform,vendor:navigator.vendor||null,hardware_concurrency:navigator.hardwareConcurrency||null,device_memory_gb:navigator.deviceMemory||null,max_touch_points:navigator.maxTouchPoints||0,cookie_enabled:!!navigator.cookieEnabled,online:navigator.onLine},system:{name:system},browser:{name:browser,user_agent:agent,brands:ua?.brands||null,mobile_hint:!!mobile,do_not_track:navigator.doNotTrack||null},display:{screen_width:screen.width||null,screen_height:screen.height||null,available_width:screen.availWidth||null,available_height:screen.availHeight||null,viewport_width:innerWidth,viewport_height:innerHeight,pixel_ratio:devicePixelRatio||1,color_depth:screen.colorDepth||null,orientation:screen.orientation?.type||null},locale:{language:navigator.language||null,languages:(navigator.languages||[]).slice(0,10),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,timezone_offset_minutes:new Date().getTimezoneOffset()},connection:cn?{effective_type:cn.effectiveType||null,downlink_mbps:cn.downlink||null,rtt_ms:cn.rtt||null,save_data:!!cn.saveData}:null,attribution:{referrer_host:(()=>{try{return document.referrer?new URL(document.referrer).hostname:null}catch(_){return null}})(),utm}};
const base={visitor_id:vid,session_id:sid,first_party_notice:true};
function send(path,data){return fetch(API+path,{method:"POST",mode:"cors",credentials:"omit",cache:"no-store",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({...base,...data})}).catch(()=>null)}
const visit=send("/api/visit",{page:clean(location.href),referrer:clean(document.referrer),language:navigator.language,timezone:meta.locale.timezone,screen:{width:screen.width,height:screen.height},metadata:meta});
window.__visitorTrackingPromise=visit;
function event(type,details={},duration=null){send("/api/event",{event_type:type,page:clean(location.href),duration_ms:duration,details})}
event("page_view",{title:document.title.slice(0,180),entry_page:!document.referrer||(()=>{try{return new URL(document.referrer).origin!==location.origin}catch(_){return true}})(),referrer_host:meta.attribution.referrer_host,utm});
let started=Date.now();
function perf(){try{const n=performance.getEntriesByType("navigation")[0],resources=performance.getEntriesByType("resource");if(n)event("page_performance",{dom_content_loaded_ms:Math.round(n.domContentLoadedEventEnd),load_ms:Math.round(n.loadEventEnd),response_ms:Math.round(n.responseEnd-n.requestStart),transfer_bytes:n.transferSize||0,resource_count:resources.length,resource_duration_ms:Math.round(resources.reduce((a,x)=>a+x.duration,0)),failed_resource_count:resources.filter(x=>x.transferSize===0&&x.duration>0).length})}catch(_){}}
if(document.readyState==="complete")setTimeout(perf,0);else addEventListener("load",()=>setTimeout(perf,0),{once:true});
function vital(name,value,rating){if(Number.isFinite(value))event("web_vital",{name,value:Math.round(value*100)/100,rating:rating||null})}
try{
let lcpObs=new PerformanceObserver(list=>{const a=list.getEntries();if(a.length){const x=a[a.length-1];vital("LCP",x.startTime)}});
lcpObs.observe({type:"largest-contentful-paint",buffered:true});
let cls=0,clsObs=new PerformanceObserver(list=>{for(const x of list.getEntries())if(!x.hadRecentInput)cls+=x.value;vital("CLS",cls)});
clsObs.observe({type:"layout-shift",buffered:true});
let inp=0,inpObs=new PerformanceObserver(list=>{for(const x of list.getEntries())if(x.interactionId)inp=Math.max(inp,x.duration);vital("INP",inp)});
inpObs.observe({type:"event",buffered:true,durationThreshold:40});
}catch(_){}
const milestones=[25,50,75,90],sent=new Set();
function scroll(){const d=document.documentElement,max=Math.max(1,d.scrollHeight-innerHeight),pct=Math.min(100,Math.round((scrollY/max)*100));for(const m of milestones)if(pct>=m&&!sent.has(m)){sent.add(m);event("scroll_depth",{milestone:m})}}
addEventListener("scroll",scroll,{passive:true});
function end(){event("page_exit",{},Math.min(86400000,Math.max(0,Date.now()-started)))}
addEventListener("pagehide",end);addEventListener("hashchange",()=>{end();started=Date.now();event("page_view",{title:document.title.slice(0,180),navigation:"hash"})});
document.addEventListener("visibilitychange",()=>event(document.visibilityState==="hidden"?"tab_hidden":"tab_visible"));
document.addEventListener("click",e=>{const el=e.target?.closest?.("[data-analytics-action]");if(!el)return;const action=el.getAttribute("data-analytics-action");if(action&&/^[a-z0-9_.:-]{1,60}$/i.test(action))event("ui_click",{action})},true);
addEventListener("error",e=>{const x=e.target;if(x&&x!==window){let resource=null;try{const u=new URL(x.src||x.href,location.href);resource=u.origin+u.pathname}catch(_){}event("resource_error",{resource})}else event("javascript_error",{message:String(e.message||"Script error").slice(0,240),file:clean(e.filename||"")})},true);
addEventListener("unhandledrejection",e=>event("unhandled_rejection",{message:String(e.reason?.message||e.reason||"Unhandled rejection").slice(0,240)}));
if(cn?.addEventListener)cn.addEventListener("change",()=>event("network_change",{effective_type:cn.effectiveType||null,downlink_mbps:cn.downlink||null,rtt_ms:cn.rtt||null}));
if(ua?.getHighEntropyValues)ua.getHighEntropyValues(["architecture","bitness","model","platformVersion","uaFullVersion"]).then(v=>event("browser_details",v)).catch(()=>{});
})();