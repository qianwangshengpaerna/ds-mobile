#!/usr/bin/env python3
"""Build the dependency-free Android host with official Android build tools.
Run frontend npm ci && npm run build first, or pass --web to do it here.
Needs JDK 17+, curl, unzip, aapt2, d8, zipalign, apksigner and platform android.jar.
DS_ANDROID_TOOLS and DS_ANDROID_JAR select existing SDK files. The fallback
fetches pinned SDK archives over HTTPS and verifies SHA256 recorded at creation.
"""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,zipfile
ROOT=pathlib.Path(__file__).resolve().parent
release=json.loads((ROOT/'version.json').read_text())
p=argparse.ArgumentParser();p.add_argument('--web',action='store_true');a=p.parse_args()
def run(args,cwd=ROOT):subprocess.run([str(x) for x in args],cwd=cwd,check=True)
if a.web:
 run(['npm','ci'],ROOT/'upstream');run(['npm','run','build'],ROOT/'upstream')
if not (ROOT/'upstream/dist/index.html').is_file():raise SystemExit('Build the frontend first: cd upstream && npm ci && npm run build')
cache=ROOT/'.sdk';cache.mkdir(exist_ok=True)
pins=__import__('json').loads((ROOT/'sdk-checksums.json').read_text())
def sdk(file,url,expected):
 archive=cache/file
 if not archive.exists():run(['curl','-fL','--retry','2',url,'-o',archive])
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise SystemExit('SDK checksum mismatch: '+file)
 with zipfile.ZipFile(archive) as z:z.extractall(cache)
tools=pathlib.Path(os.environ.get('DS_ANDROID_TOOLS',str(cache/'android-15')))
androidjar=pathlib.Path(os.environ.get('DS_ANDROID_JAR',str(cache/'android-35/android.jar')))
if not tools.is_dir():sdk('build-tools.zip','https://dl.google.com/android/repository/build-tools_r35_linux.zip',pins['build-tools.zip'])
if not androidjar.is_file():sdk('platform.zip','https://dl.google.com/android/repository/platform-35_r02.zip',pins['platform.zip'])
for name in ['aapt2','zipalign','apksigner','d8']: (tools/name).chmod(0o755)
assets=ROOT/'android/app/src/main/assets/web'
shutil.rmtree(assets,ignore_errors=True);shutil.copytree(ROOT/'upstream/dist',assets)
build=ROOT/'android/manual-build';shutil.rmtree(build,ignore_errors=True);(build/'classes').mkdir(parents=True);(build/'dex').mkdir()
manifest=(ROOT/'android/app/src/main/AndroidManifest.xml').read_text().replace('<manifest ',f'<manifest package="app.dsmobile" android:versionCode="{release["version_code"]}" android:versionName="{release["version_name"]}" ',1)
(build/'AndroidManifest.xml').write_text(manifest)
run([tools/'aapt2','compile','--dir',ROOT/'android/app/src/main/res','-o',build/'resources.zip'])
run([tools/'aapt2','link','-o',build/'unsigned.apk','-I',androidjar,'--manifest',build/'AndroidManifest.xml','-A',ROOT/'android/app/src/main/assets',build/'resources.zip'])
sources=list((ROOT/'android/app/src/main/java').rglob('*.java'))
if shutil.which('javac'):
 run(['javac','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',str(androidjar)+os.pathsep+str(tools/'core-lambda-stubs.jar'),'-d',build/'classes',*sources])
else:
 ecj=cache/'ecj.jar'
 if not ecj.exists():run(['curl','-fL','https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.40.0/ecj-3.40.0.jar','-o',ecj])
 if hashlib.sha256(ecj.read_bytes()).hexdigest()!=pins['ecj.jar']:raise SystemExit('ECJ checksum mismatch')
 run(['java','-jar',ecj,'-1.8','-encoding','UTF-8','-bootclasspath',str(androidjar)+os.pathsep+str(tools/'core-lambda-stubs.jar'),'-d',build/'classes',*sources])
run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--lib',androidjar,'--min-api','26','--output',build/'dex',*list((build/'classes').rglob('*.class'))])
with zipfile.ZipFile(build/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:
 for f in (build/'dex').glob('*.dex'):z.write(f,f.name)
run([tools/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk'])
# Local development certificate; never use it for store releases. Keep it outside the source archive.
keystore=ROOT/'.signing/dev.jks';keystore.parent.mkdir(exist_ok=True)
if not keystore.exists():run(['keytool','-genkeypair','-keystore',keystore,'-storepass','android','-alias','dsmobile','-keypass','android','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=ds mobile Development'])
out=ROOT.parent/f'ds-mobile-v{release["version_name"]}.apk'
run([tools/'apksigner','sign','--ks',keystore,'--ks-pass','pass:android','--ks-key-alias','dsmobile','--key-pass','pass:android','--out',out,build/'aligned.apk'])
run([tools/'apksigner','verify','--verbose',out]);print(out)
