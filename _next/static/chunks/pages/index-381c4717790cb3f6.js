(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[405],{8312:function(n,t,e){(window.__NEXT_P=window.__NEXT_P||[]).push(["/",function(){return e(4813)}])},3992:function(n,t,e){"use strict";e.d(t,{QJ:function(){return r},hq:function(){return u}});var r="798545046239588352",u="927733787578949632"},4813:function(n,t,e){"use strict";e.r(t),e.d(t,{default:function(){return j}});var r=e(7568),u=e(1799),a=e(9396),i=e(655),c=e(5893),s=e(7294),o=e(9473),l=e(196),f=e(5478),h=e(1163),p=e(3992),$=e(1669),d=e(8911),_=e(4641),g=e(1533),y=e(9222);function m(n,t){return v.apply(this,arguments)}function v(){return(v=(0,r.Z)(function(n,t){return(0,i.__generator)(this,function(e){switch(e.label){case 0:var u;return[4,fetch("https://api.sleeper.app/v1/league/".concat(n)).then(function(n){return n.json()}).then((u=(0,r.Z)(function(n){var e,r;return(0,i.__generator)(this,function(u){switch(u.label){case 0:if(!n)throw Error("No data");if(e=((r={}).name=n.name,r.season=n.season,r.leagueId=n.league_id,r.numOfTeams=n.total_rosters,r.status=n.status,r.draftId=n.draft_id,r),t.push(e),!n.previous_league_id)return[3,2];return[4,m(n.previous_league_id,t)];case 1:return u.sent(),[3,3];case 2:return[2,t];case 3:return[2]}})}),function(n){return u.apply(this,arguments)})).catch(function(n){throw Error(n)})];case 1:return[2,e.sent()]}})})).apply(this,arguments)}function x(){return(x=(0,r.Z)(function(n){var t;return(0,i.__generator)(this,function(e){return[2,m(n,t=[]).then(function(){return t}).catch(function(n){throw Error(n)})]})})).apply(this,arguments)}var j=function(){var n,t=(0,s.useState)(!1),e=t[0],m=t[1],v=(0,s.useState)(!1),j=v[0],b=v[1],w=(0,s.useState)(""),Z=w[0],k=w[1],q=(0,o.I0)(),C=(0,h.useRouter)(),I=(n=(0,r.Z)(function(n){var t,e;return(0,i.__generator)(this,function(r){switch(r.label){case 0:if(b(!0),""===n)return m(!0),b(!1),[2];return[4,l.Z.get("https://api.sleeper.app/v1/league/".concat(n,"/users")).then(function(n){return n.data}).catch(function(n){return n})];case 1:return t=r.sent(),[4,l.Z.get("https://api.sleeper.app/v1/league/".concat(n,"/rosters")).then(function(n){return n.data}).catch(function(n){return n})];case 2:return Promise.all([t,e=r.sent(),function(n){return x.apply(this,arguments)}(n)]).then(function(n){var t=n[0],e=n[1],r=n[2],i=e.map(function(n){var e=t.find(function(t){return t.user_id===n.owner_id});return(0,a.Z)((0,u.Z)({},n),{display_name:e.display_name,team_name:e.metadata.team_name})});q((0,f.lt)(r)),q((0,f.DZ)(i)),C.push("/trades")}).catch(function(n){b(!1),m(!0)}),[2]}})}),function(t){return n.apply(this,arguments)}),N=function(n){k(n.target.value),m(!1)},z=function(){m(!1),k(p.QJ)},E=function(){m(!1),k(p.hq)};return(0,c.jsxs)($.g,{bg:"quinary",roundedTop:"lg",py:8,spacing:5,h:"100vh",children:[(0,c.jsx)(d.x,{color:"primary",fontWeight:600,children:"Enter your Sleeper League ID:"}),(0,c.jsxs)($.g,{children:[(0,c.jsxs)(_.U,{children:[(0,c.jsx)(g.I,{value:Z,rounded:"full",bg:"primary",color:"quinary",placeholder:"e.g. 798545046239588352",onChange:N}),(0,c.jsx)(y.z,{rounded:"full",onClick:function(){return I(Z)},isLoading:j,variant:"outline",color:"primary",children:"Go"})]}),e&&(0,c.jsx)(d.x,{color:"red.500",children:"No league found for this ID"})]}),(0,c.jsxs)(_.U,{children:[(0,c.jsx)(y.z,{size:"sm",bg:"quaternary",color:"primary",onClick:z,children:"LadsLadsLads"}),(0,c.jsx)(y.z,{size:"sm",bg:"quaternary",color:"primary",onClick:E,children:"Dynasty"})]})]})}}},function(n){n.O(0,[299,774,888,179],function(){return n(n.s=8312)}),_N_E=n.O()}]);