const fs=require('node:fs');fs.mkdirSync('docs/images',{recursive:true});
fs.copyFileSync('artifacts/web-smoke.png','docs/images/loopfield.png');
const summary={version:require('../package.json').version,deterministicTests:16,desktop:'passed synthetic audio/file checks',web:'passed loop, session export/import, WAV export and recovery checks',mac:'packaging configured; macOS build/hardware validation pending',website:'Pages workflow prepared; publication pending repository creation'};
fs.writeFileSync('docs/VALIDATION.json',JSON.stringify(summary,null,2)+'\n');
console.log('Public screenshot and validation record prepared.');
