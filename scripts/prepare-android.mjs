import {readFile,writeFile} from 'node:fs/promises';
const root='src-tauri/gen/android/app/';
let gradle=await readFile(root+'build.gradle.kts','utf8');gradle=gradle.replace(/compileSdk = \d+/,'compileSdk = 36').replace(/targetSdk = \d+/,'targetSdk = 36');await writeFile(root+'build.gradle.kts',gradle);
let manifest=await readFile(root+'src/main/AndroidManifest.xml','utf8');if(!manifest.includes('android:allowBackup'))manifest=manifest.replace('<application','<application\n        android:allowBackup="false"\n        android:fullBackupContent="false"');await writeFile(root+'src/main/AndroidManifest.xml',manifest);
