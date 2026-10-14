const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {output,pkg}=require('./paths.cjs');const root=path.resolve(output,'win-unpacked');
if(!root.startsWith(path.resolve('dist')+path.sep))throw Error('Unexpected package directory');
const destination=path.join(output,`${pkg.build.productName}-${pkg.version}-win-x64.zip`),fd=fs.openSync(destination,'w');
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=data=>{let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
let offset=0;const entries=[];
function write(buffer){fs.writeSync(fd,buffer);offset+=buffer.length;}
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue;}if(!entry.isFile())throw Error('Unsupported package entry');
 const name=Buffer.from(path.relative(root,file).split(path.sep).join('/')),data=fs.readFileSync(file),compressed=zlib.deflateRawSync(data,{level:6}),sum=crc(data),start=offset;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(sum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);write(local);write(name);write(compressed);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(sum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(start,42);entries.push(Buffer.concat([central,name]));
}}
try{walk(root);const start=offset;for(const entry of entries)write(entry);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(offset-start,12);end.writeUInt32LE(start,16);write(end);}finally{fs.closeSync(fd);}
const hash=crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');fs.writeFileSync(`${destination}.sha256`,`${hash}  ${path.basename(destination)}\n`);console.log(`Windows ZIP ready: ${destination} (${fs.statSync(destination).size} bytes)`);
