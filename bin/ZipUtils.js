"use strict";
// import JSZip from "jszip";
Object.defineProperty(exports, "__esModule", { value: true });
const JSZip = require('jszip');
const fs = require('fs');
const ScanDir = require("./scandir/scandir");
// const ScanDir = require("./scandir/scandir");
// console.log(ScanDir);
/*
var utils = new ZipUtils();
utils.merge(["file1.zip", "file2.zip"]).then(()=>{
    utils.save("merge2.zip");
});
*/
class FileLoader {
    load(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, (err, data) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    resolve(data);
                }
            });
        });
    }
    scanDir(folder) {
    }
}
class ZipUtils {
    constructor() {
        this.instance = new JSZip();
        this.loader = new FileLoader();
    }
    listFiles() {
        this.instance.forEach(function (relativePath, zipEntry) {
            console.log(relativePath);
        });
        // return this.instance.file(path);
    }
    zipFolder(folder, path) {
        return new Promise((resolve, reject) => {
            var files = [];
            var s = ScanDir.create();
            s.on('file', (file) => {
                var nativePath = file;
                if (path != folder) {
                    file = file.replace(folder, path);
                }
                var targetPath = file;
                files.push({
                    nativePath: nativePath,
                    path: file
                });
            });
            s.on('end', (file) => {
                // console.log(file);
                // files.push(file);
                resolve(files);
            });
            s.scan({
                dir: folder,
                recursive: true
            });
        }).then((files) => {
            return files.reduce((p, f) => {
                return p.then(() => {
                    return this.addFile(f.path, f.nativePath);
                });
                return 5;
            }, Promise.resolve(1));
        });
    }
    removeFile(path) {
        this.instance.remove(path);
        return this;
    }
    addFile(path, file) {
        path = path.replace(/[\\]/g, "/");
        path = path.replace(/(^\/)/, "");
        // console.log(`adding file ${path} ${file}`);
        return this.loader.load(file).then((data) => {
            return this.instance.file(path, data);
        });
    }
    replaceFile(path, file) {
        this.instance.remove(path);
        path = path.replace(/[\\]/g, "/");
        this.instance.remove(path);
        // console.log(`adding file ${path} ${file}`);
        return this.loader.load(file).then((data) => {
            return this.instance.file(path, data);
        });
    }
    add(path, data) {
        return this.instance.file(path, data);
    }
    replace(path, data) {
        this.instance.remove(path);
        return this.instance.file(path, data);
    }
    // not implement yet
    readFile(file) {
        return this.loader.load(file).then((data) => {
            return this.instance.loadAsync(data);
        });
    }
    addZip(zip) {
        return this.merge([zip]);
    }
    addZipArray(zipArray) {
        return this.merge(zipArray);
    }
    merge(files) {
        return files.reduce((promise, file) => {
            return promise.then(() => {
                // console.log("add package", file);
                return this.loader.load(file).then((data) => {
                    return this.instance.loadAsync(data);
                });
            });
        }, Promise.resolve(1));
    }
    /**
    .save(
        "sample.zip",
        {
            compression: "DEFLATE",
            compressionOptions: {
                level: 3
            }
        }
    );
    // https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html#compression-and-compressionoptions-options
    // compressionOptions : {level:6} (or any level between 1 (best speed) and 9 (best compression)).
    **/
    save(filename, extraOptions) {
        return new Promise((resolve, reject) => {
            var option = { type: 'nodebuffer', streamFiles: true };
            if (extraOptions) {
                for (var key in extraOptions) {
                    option[key] = extraOptions[key];
                }
            }
            this.instance.generateNodeStream(option).pipe(fs.createWriteStream(filename))
                .on('finish', function () {
                resolve(null);
                // console.log("sample.zip written.");
            });
        });
        /*
        zip
        .generateNodeStream({streamFiles:true})
        .pipe(fs.createWriteStream('out.zip'))
        .on('data', function (data, metadata) {
            // data is a Uint8Array because that's the type asked in generateInternalStream
            // metadata contains for example currentFile and percent, see the generateInternalStream doc.
        })
        .on('error', function (e) {
            // e is the error
        })
        .on('finish', function () {
            // JSZip generates a readable stream with a "end" event,
            // but is piped here in a writable stream which emits a "finish" event.
            console.log("out.zip written.");
        });
        */
    }
}
module.exports = ZipUtils;
// Sample Code
// const jszip = new JSZip();
/*
try {
    // const pdfData = fs.readFileSync('sample.pdf');
    // jszip.file("PDFFile.pdf", pdfData);
    
    jszip.file("Textfile.txt", "Hello NodeJS\n");

    
    const images = ["coding-science.jpg", "programming-languages.jpg"];
    const img = jszip.folder("images");

    for (const image of images) {
        const imageData = fs.readFileSync(image);
        img.file(image, imageData);
    }
    
    jszip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
        .pipe(fs.createWriteStream('sample.zip'))
        .on('finish', function () {
            console.log("sample.zip written.");
        });
    
} catch (err) {
    console.log(err);
}

*/
/*
read_zip("file1.zip").then((zip)=>{
    zip.forEach(function (relativePath, zipEntry) {
        console.log("A", relativePath);
        zipEntry.async("uint8array") .then((content)=>{
            console.log(relativePath, content);
            // fileReader.readAsArrayBuffer(content);
        });
        console.log("B", relativePath);
    });
    console.log("C");
    // JSZipUtils.getBinaryContent(zip.file("nodfile1.zip").
});
*/
/*
utils.merge(["file1.zip", "file2.zip"]).then(()=>{
    utils.save("merge2.zip");
});
*/
// merge_files(["file1.zip", "file2.zip"], "merge.zip");
// merge_files2(["file1.zip", "file2.zip"], "merge.zip");
