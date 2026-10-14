const {spawn}=require('node:child_process');
const path=require('node:path');
const {output,pkg}=require('./paths.cjs');
if(process.platform!=='darwin')throw Error('Run this check on macOS');
const binary=path.resolve(output,process.arch==='arm64'?'mac-arm64':'mac',`${pkg.build.productName}.app/Contents/MacOS/${pkg.build.productName}`);
const child=spawn(binary,[],{stdio:['ignore','pipe','pipe']});
let outputText='',stopping=false;
child.stdout.on('data',b=>outputText+=b);
child.stderr.on('data',b=>outputText+=b);
child.on('error',e=>{console.error(e);process.exitCode=1;});
child.on('exit',(code,signal)=>{
  clearTimeout(timer);
  console.log(outputText);
  if(!stopping){console.error(`Packaged app exited early: ${code} ${signal}`);process.exitCode=1;}
});
const timer=setTimeout(()=>{
  if(/code signature invalid|library load disallowed|Termination Reason:|Fatal error|render process gone/i.test(outputText)){
    console.error(outputText);process.exitCode=1;
  }else console.log('Packaged macOS app stayed running for 15 seconds. Hardware audio remains untested.');
  stopping=true;child.kill('SIGTERM');
},15000);
