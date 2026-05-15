
step 1
npm install https://github.com/XXXXXXX/XXXX

step 2 create config.json
``` 
{
	"name":"my-task",
	"cwd": ".",
	"env": {
		"JAVA_HOME": "C:/jdk",
		"FLEX_SDK": "C:/flex",
		"FLEX_BIN": "C:/flex/bin",
		"PATH": "%FLEX_BIN%;%PATH%"
	},
	"tasks": [
		{
			"name": "pre-build",
			"type": "batch",
			"command": "dir"
		},
		{
			"name": "build",
			"type": "batch",
			"command": "mxmlc",
			"args": [
				"src/Main.as",
				"-o",
				"dist/app.swf"
			],
			"group": ["build", "all"]
		},
		{
			"name": "post-build",
			"type": "batch",
			"command": "dir"
		},
		{
			"name": "zip",
			"type": "zip",
			"files": [
				"dist/app.swf",
				"README.md"
			],
			"output": "package/app.zip",
			"group": ["pack", "all"]
		},
		{
			"account": "production",
			"cwd": "bin",
			"name": "upload",
			"type": "upload",
			"files":["output.zip"],
			"path": "tmp",
			"mkdir": false,
			"group": ["upload", "all"]
		},
		{
			"name": "notify",
			"type": "http",
			"method": "POST",
			"url": "https://example.com/deploy/notify",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": {
				"status": "success",
				"artifact": "app.zip"
			},
			"group": ["notify", "all"]
		}
	]
}
```


step 3 create .ftp-credentials.json
```
{
	"production": {
		"host": "localhost",
		"username": "username",
		"password": "password",
		"port": 1337
	},
	"staging": {
		"host": "staging.example.com",
		"username": "deployer",
		"password": "staging-pass",
		"port": 21,
		"secure": false
	},
	"backup": {
		"host": "backup.example.com",
		"username": "backup-user",
		"password": "backup-pass"
	}
}

```


step 4
update package.json
{
	"scripts":{
		"deploy":"ftp-deploy --config config.json --creds .ftp-credentials.json",
		"build":"ftp-deploy --config config.json --creds .ftp-credentials.json --group build"
	}
}

step 5
npm run deploy