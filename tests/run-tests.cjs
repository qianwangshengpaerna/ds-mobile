const path=require('node:path'),cp=require('node:child_process');const root=path.join(__dirname,'..');const esbuild=require(path.join(root,'upstream/node_modules/esbuild'));
cp.execFileSync('python3',[path.join(__dirname,'make_fixtures.py')],{stdio:'inherit'});
const options={bundle:true,platform:'node',format:'cjs',define:{__API_ORIGIN__:JSON.stringify('https://api.deepseek.com')}};
esbuild.buildSync({...options,entryPoints:[path.join(__dirname,'entry.ts')],outfile:path.join(__dirname,'bundle.cjs')});
esbuild.buildSync({...options,entryPoints:[path.join(__dirname,'ui-entry.tsx')],outfile:path.join(root,'upstream/.tests/ui.cjs'),jsx:'automatic',external:['react','react-dom','react-dom/client'],loader:{'.css':'empty'}});
for(const file of ['integration.cjs','models-documents.cjs','ui.cjs','viewport.cjs','bridge.cjs'])cp.execFileSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
