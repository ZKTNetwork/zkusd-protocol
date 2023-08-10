import fs from 'fs';
import path from 'path';

const processFile = (filePath: string) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Failed to read file: ${filePath}`);
            return;
        }

        const unlicensedSPDX = '// SPDX-License-Identifier: UNLICENSED';
        const mitSPDX = '// SPDX-License-Identifier: MIT';

        if (data.startsWith(unlicensedSPDX)) {
            const newData = data.replace(unlicensedSPDX, mitSPDX);
            fs.writeFile(filePath, newData, 'utf8', (err) => {
                if (err) {
                    console.error(`Failed to write file: ${filePath}`);
                    return;
                }
                console.log(`Updated SPDX-License-Identifier to MIT in ${filePath}`);
            });
        }
    });
};

const processDirectory = (directoryPath: string) => {
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error(`Failed to read directory: ${directoryPath}`);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(directoryPath, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Failed to get file stats: ${filePath}`);
                    return;
                }

                if (stats.isDirectory()) {
                    processDirectory(filePath);
                } else if (filePath.endsWith('.sol')) {
                    processFile(filePath);
                }
            });
        });
    });
};

const contractsDirectory = path.join(__dirname, '..', 'contracts');
processDirectory(contractsDirectory);