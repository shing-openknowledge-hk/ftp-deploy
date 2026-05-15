"use strict";
var Client = require('ftp');
var fs = require('fs');
class FTPClient {
    /*
        host - string - The hostname or IP address of the FTP server. Default: 'localhost'
        port - integer - The port of the FTP server. Default: 21
        secure - mixed - Set to true for both control and data connection encryption, 'control' for control connection encryption only, or 'implicit' for implicitly encrypted control connection (this mode is deprecated in modern times, but usually uses port 990) Default: false
        secureOptions - object - Additional options to be passed to tls.connect(). Default: (none)
        user - string - Username for authentication. Default: 'anonymous'
        password - string - Password for authentication. Default: 'anonymous@'
        connTimeout - integer - How long (in milliseconds) to wait for the control connection to be established. Default: 10000
        pasvTimeout - integer - How long (in milliseconds) to wait for a PASV data connection to be established. Default: 10000
        keepalive - integer - How often (in milliseconds) to send a 'dummy' (NOOP) command to keep the connection alive. Default: 10000
    */
    constructor(account) {
        this.account = { ...account };
        if (this.account.username && !this.account.user) {
            this.account.user = this.account.username;
        }
        this.client = new Client();
    }
    upload(localFile, serverPath) {
        // console.log("start upload", localFile, serverPath);
        return new Promise((resolve, reject) => {
            this.client.put(localFile, serverPath, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    // c.end();
                    resolve();
                }
            });
        });
    }
    mkdir(dirPath, recursive) {
        return new Promise((resolve, reject) => {
            this.client.mkdir(dirPath, recursive, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    connect() {
        return new Promise((resolve, reject) => {
            this.client.on("error", (err) => {
                reject(err);
            });
            this.client.on('ready', function () {
                console.log("connected");
                // c.end();
                resolve("connected");
            });
            // connect to localhost:21 as anonymous
            this.client.connect(this.account);
        });
    }
    close() {
        this.client.end();
    }
}
module.exports = FTPClient;
/*
var c = new Client();
c.on('ready', function() {
  console.log("ready");
    c.put('foo.txt', 'foo.remote-copy.txt', function(err) {
      if (err) throw err;
      c.end();
    });
    
c.end();
});
// connect to localhost:21 as anonymous
c.connect();
*/ 
