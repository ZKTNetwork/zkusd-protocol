import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const protocolDir = path.resolve('contracts/protocol');

fs.readdir(protocolDir, (err, files) => {
    if (err) {
        console.error(`Unable to scan directory: ${err}`);
    } else {
        files.forEach(file => {
            if (path.extname(file) === '.sol') {
                const command = `npx hardhat flatten ${protocolDir}/${file} > flatten/${file}`;
                execSync(command);
            }
        });
    }
});