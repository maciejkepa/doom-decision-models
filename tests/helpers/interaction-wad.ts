// Diagnostic fixture only. Keep full Freedoom geometry; place the spawn in front of a surface.
// This helper is never imported by the game, server, or production controller.
import { readFileSync } from 'node:fs';
export function interactionWad(options:{kind?:'door'|'switch';distance?:number;special?:number;secret?:boolean;angleOffset?:number;key?:{type:number;distance:number}}={}){
  const wad=readFileSync('public/assets/freedoom1.wad');
  const count=wad.readInt32LE(4),directory=wad.readInt32LE(8);
  const lumps=Array.from({length:count},(_,i)=>{const at=directory+i*16;return {name:wad.toString('ascii',at+8,at+16).replace(/\0/g,''),start:wad.readInt32LE(at),size:wad.readInt32LE(at+4)};});
  const map=lumps.findIndex(l=>l.name==='E1M1');
  const lump=(name:string)=>{const l=lumps.slice(map+1,map+11).find(l=>l.name===name)!;return wad.subarray(l.start,l.start+l.size);};
  const vertices=lump('VERTEXES'),lines=lump('LINEDEFS'),things=lump('THINGS');
  const vertex=(i:number)=>({x:vertices.readInt16LE(i*4),y:vertices.readInt16LE(i*4+2)});
  const candidates=Array.from({length:lines.length/14},(_,i)=>{
    const at=i*14,a=vertex(lines.readUInt16LE(at)),b=vertex(lines.readUInt16LE(at+2));
    return {id:i,at,a,b,special:lines.readUInt16LE(at+6),flags:lines.readUInt16LE(at+4),length:Math.hypot(b.x-a.x,b.y-a.y)};
  });
  const surface=candidates.find(l=>(options.kind==='switch'?[62,63,61,21,29,103,11].includes(l.special):l.special===1)&&!(l.flags&32)&&l.length>=32&&(l.a.x===l.b.x||l.a.y===l.b.y));
  if(!surface)throw Error('No suitable interaction fixture in the pinned E1M1.');
  const dx=surface.b.x-surface.a.x,dy=surface.b.y-surface.a.y;
  const distance=options.distance??40,nx=dy/surface.length,ny=-dx/surface.length;
  const x=Math.round((surface.a.x+surface.b.x)/2+nx*distance),y=Math.round((surface.a.y+surface.b.y)/2+ny*distance);
  const angle=(Math.round(Math.atan2(-ny,-nx)*180/Math.PI)+360+(options.angleOffset??0))%360;
  for(let i=0;i<things.length;i+=10){
    if(things.readUInt16LE(i+6)===1){things.writeInt16LE(x,i);things.writeInt16LE(y,i+2);things.writeInt16LE(angle,i+4);}
    else things.writeUInt16LE(things.readUInt16LE(i+8)&~7,i+8); // Isolate interaction, remove spawned things including enemies.
  }
  if(options.key){
    const slot=Array.from({length:things.length/10},(_,i)=>i*10).find(i=>things.readUInt16LE(i+6)!==1);
    if(slot===undefined)throw Error('No thing slot for diagnostic key.');
    things.writeInt16LE(Math.round(x-nx*options.key.distance),slot);things.writeInt16LE(Math.round(y-ny*options.key.distance),slot+2);
    things.writeInt16LE(0,slot+4);things.writeUInt16LE(options.key.type,slot+6);things.writeUInt16LE(7,slot+8);
  }
  if(options.special!==undefined)lines.writeUInt16LE(options.special,surface.at+6);
  if(options.secret)lines.writeUInt16LE(surface.flags|32,surface.at+4);
  return {wad,id:surface.id,special:surface.special,spawn:{x,y,angle},candidates:candidates.filter(l=>l.special>0)};
}
