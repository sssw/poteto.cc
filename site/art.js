const TAU=Math.PI*2;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function path(c,points,fill){c.fillStyle=fill;c.beginPath();points(c);c.fill();}
export function potato(c,x,y,size,t=0,fall=false){
 c.save();c.translate(x,y);c.rotate(fall?t*.8:Math.sin(t*1.7)*.045);c.scale(size/90,size/90);
 ellipse(c,-30,33,12,6,'#795c3f');ellipse(c,29,33,12,6,'#795c3f');
 c.strokeStyle='#947248';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(-36,5);c.quadraticCurveTo(-52,0,-52,-10);c.moveTo(36,5);c.quadraticCurveTo(50,0,50,-10);c.stroke();
 const gradient=c.createLinearGradient(-30,-50,35,40);gradient.addColorStop(0,'#f3d29a');gradient.addColorStop(.65,'#e8b777');gradient.addColorStop(1,'#cf9658');
 path(c,p=>{p.moveTo(-39,6);p.bezierCurveTo(-47,-15,-27,-47,-7,-47);p.bezierCurveTo(14,-54,35,-32,40,-4);p.bezierCurveTo(52,29,25,45,-2,43);p.bezierCurveTo(-25,45,-42,30,-39,6);},gradient);
 c.strokeStyle='#a37848';c.lineWidth=1.8;c.stroke();
 ellipse(c,-17,-28,4,2,'#e3b575');ellipse(c,25,19,2,3,'#c89356');ellipse(c,-28,18,2,2.5,'#c89356');ellipse(c,23,-17,2,2,'#d3a165');
 ellipse(c,-17,8,8,4,'#e6a18a');ellipse(c,21,8,8,4,'#e6a18a');
 const blink=Math.sin(t*.66)>0.994;
 if(blink){c.strokeStyle='#5e4b37';c.lineWidth=3;c.beginPath();c.moveTo(-16,-2);c.lineTo(-10,-2);c.moveTo(12,-2);c.lineTo(18,-2);c.stroke();}else{ellipse(c,-13,-2,3,4.5,'#514b36');ellipse(c,15,-2,3,4.5,'#514b36');ellipse(c,-12,-3,1,1,'#fff5dd');ellipse(c,16,-3,1,1,'#fff5dd');}
 c.strokeStyle='#6b513a';c.lineWidth=2.3;c.beginPath();c.moveTo(-3,8);c.quadraticCurveTo(2,15,8,7);c.stroke();
 c.strokeStyle='#66804b';c.lineWidth=3;c.beginPath();c.moveTo(-3,-46);c.quadraticCurveTo(-4,-58,2,-63);c.stroke();
 path(c,p=>{p.moveTo(-1,-53);p.quadraticCurveTo(-20,-50,-17,-64);p.quadraticCurveTo(-3,-66,-1,-53);},'#7e9858');
 path(c,p=>{p.moveTo(0,-58);p.quadraticCurveTo(2,-77,17,-69);p.quadraticCurveTo(14,-55,0,-58);},'#8fa766');
 c.restore();
}
function flower(c,x,y,s,t){c.save();c.translate(x,y);c.rotate(Math.sin(t+x)*.06);c.strokeStyle='#95a471';c.lineWidth=1.5;c.beginPath();c.moveTo(0,0);c.lineTo(0,-s*2);c.stroke();for(let j=0;j<5;j++){const a=j*TAU/5;ellipse(c,Math.cos(a)*s*.5,-s*2+Math.sin(a)*s*.5,s*.43,s*.43,'#fffbed');}ellipse(c,0,-s*2,s*.25,s*.25,'#d9b65c');c.restore();}
export class Garden {
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d');this.camera=0;this.particles=[];this.fall=0;this.time=0;this.reduced=false;this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);}
 resize(){const b=this.canvas.getBoundingClientRect();this.w=b.width;this.h=b.height;const d=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(this.w*d);this.canvas.height=Math.round(this.h*d);this.c.setTransform(d,0,0,d,0,0);}
 burst(x){if(this.reduced)return;for(let i=0;i<12;i++)this.particles.push({x,y:0,vx:(Math.random()-.5)*100,vy:-30-Math.random()*70,life:1,color:['#eed177','#e1a098','#99b581'][i%3]});}
 draw(game,dt,active){const c=this.c,w=this.w,h=this.h;this.time+=this.reduced?0:dt;const t=this.time;const mobile=w<620,bar=document.getElementById('controls').offsetHeight;const floor=h-bar;const base=active?floor*.67:mobile?floor*.83:floor*.71;const cell=Math.min(mobile?80:112,w/(mobile?5.1:8.2));
 c.clearRect(0,0,w,h);const sky=c.createLinearGradient(0,0,0,floor);sky.addColorStop(0,'#eff3df');sky.addColorStop(1,'#e3edcc');c.fillStyle=sky;c.fillRect(0,0,w,h);
 ellipse(c,w*.74,floor*.22,31,31,'#f5e4a8');ellipse(c,w*.74,floor*.22,39,39,'#f7eac539');
 const cameraTarget=active?Math.max(0,game.position-1.5):0;this.camera+=(cameraTarget-this.camera)*Math.min(1,dt*5);
 for(let i=0;i<5;i++){let x=((i*w*.29-this.camera*cell*.11+t*2)%(w+170)+w+170)%(w+170)-80;let y=floor*(.16+(i%3)*.10);ellipse(c,x,y,44,9,'#fcfbedb0');ellipse(c,x-13,y-7,21,12,'#fcfbedb0');ellipse(c,x+12,y-9,18,14,'#fcfbedb0');}
 const off=this.camera*cell*.18;
 path(c,p=>{p.moveTo(0,floor);p.lineTo(0,floor*.7);for(let x=-w;x<w*2;x+=w*.8)p.quadraticCurveTo(x+w*.4-(off%(w*.8)),floor*.26,x+w*.8-(off%(w*.8)),floor*.72);p.lineTo(w,floor);},'#d4e2b9');
 path(c,p=>{p.moveTo(0,floor);p.lineTo(0,floor*.86);for(let x=-w;x<w*2;x+=w*.7)p.quadraticCurveTo(x+w*.35-(off*.6%(w*.7)),floor*.54,x+w*.7-(off*.6%(w*.7)),floor*.89);p.lineTo(w,floor);},'#bfce9d');
 path(c,p=>{p.moveTo(0,floor);p.lineTo(0,floor*.94);p.bezierCurveTo(w*.25,floor*.79,w*.69,floor*.91,w,floor*.80);p.lineTo(w,floor);},'#b0c18c');
 for(let i=0;i<25;i++){let x=(i*61-off*.7)%(w+60);if(x<0)x+=w+60;const y=floor-8-(Math.sin(i*7)+1)*10;c.strokeStyle='#94aa74';c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y-7);c.moveTo(x,y);c.lineTo(x+4,y-9);c.stroke();if(i%4===0)flower(c,x+10,y,4,t);}
 const origin=active?w*.22:mobile?w*.36:w*.20;const px=cell=>origin+(cell-1-this.camera)*this.cell;
 this.cell=cell;
 const front=Math.max(...game.platforms.map(p=>p.cell));
 if(active&&game.status!=='over'){for(let i=1;i<=2;i++){const x=px(front+i);c.save();c.setLineDash([4,6]);c.strokeStyle='#8c9f6f80';c.lineWidth=1.5;c.beginPath();c.roundRect(x-cell*.37,base,cell*.74,22,8);c.stroke();c.restore();c.fillStyle='#7d9060';c.font='11px Trebuchet MS';c.textAlign='center';c.fillText('+'+i,x,base+16);}}
 for(const p of game.platforms){const x=px(game.visualCell(p));const lift=Math.sin(p.motion*Math.PI)*20;const y=base-lift;const pw=cell*.78;const colors=p.number===1?['#d4e3ab','#8ba76a']:p.number===2?['#f3cf86','#c6a162']:['#cfb8dd','#a98bb9'];ellipse(c,x,base+50,pw*.49,5,'#82965b20');c.fillStyle=colors[1];c.beginPath();c.roundRect(x-pw/2,y,pw,29,10);c.fill();c.fillStyle=colors[0];c.beginPath();c.roundRect(x-pw/2,y-2,pw,18,8);c.fill();c.fillStyle='#ffffff50';c.beginPath();c.roundRect(x-pw/2+7,y+1,pw-14,3,2);c.fill();c.fillStyle='#566340';c.font='bold 16px Trebuchet MS';c.textAlign='center';c.fillText(p.number,x,y+20);for(let j=0;j<3;j++)ellipse(c,x-pw*.27+j*pw*.27,y+25,1,1,'#ffffff4a');}
 let x=px(active?game.position:1),y=base-34;
 const size=active?cell*.77:mobile?70:100;
 if(!active){y=base-size*.48-Math.abs(Math.sin(t*2.3))*21;}else if(game.status==='over'){this.fall+=dt;y+=this.fall*this.fall*500;}else{this.fall=0;y=base-size*.47-Math.sin(game.progress*Math.PI)*cell*(game.distance===3?1.25:1.05);}
 if(y<h+100){ellipse(c,x,base+37,Math.max(7,size*.32-(base-y)*.04),5,'#72894e22');potato(c,x,y,size,t,game.status==='over');}
 if(!active&&!mobile){c.save();c.translate(w*.34,base-115);c.rotate(.12);c.fillStyle='#849467';c.font='italic 14px Georgia';c.fillText('a very good spud',0,0);c.strokeStyle='#97a57a';c.lineWidth=1;c.beginPath();c.moveTo(0,9);c.quadraticCurveTo(-5,36,-35,45);c.stroke();c.beginPath();c.moveTo(-29,36);c.lineTo(-35,45);c.lineTo(-25,47);c.stroke();c.restore();}
 this.particles=this.particles.filter(p=>p.life>0);for(const p of this.particles){p.life-=dt*1.3;p.x+=p.vx*dt/cell;p.y+=p.vy*dt;p.vy+=180*dt;c.globalAlpha=Math.max(0,p.life);ellipse(c,px(p.x),base+p.y,3,3,p.color);}c.globalAlpha=1;
 }
}
