#!/usr/bin/env node
const fs = require('fs');
const { spawn } = require('child_process');
const JSZip = require('jszip');
// const fetch = require('node-fetch');
const Client = require('ssh2-sftp-client');
const path = require('path');
const os = require('os');

const { program } = require('commander');
import FTPClient = require('./FTPClient');

function loadCredentials(credentialsPath) {
	if (!fs.existsSync(credentialsPath)) {
		return null;
	}

	try {
		var stats = fs.statSync(credentialsPath);
		var mode = stats.mode & parseInt('777', 8);
		if (os.platform() !== 'win32' && mode & parseInt('044', 8)) {
			console.warn(`⚠  WARNING: Credentials file "${credentialsPath}" is world-readable (mode ${mode.toString(8)}). Consider restricting permissions with: chmod 600 "${credentialsPath}"`);
		}
	} catch (_) {}

	var raw = fs.readFileSync(credentialsPath, 'utf8');
	var credentials = JSON.parse(raw);

	for (const [name, account] of Object.entries(credentials)) {
		var acc = account as any;
		if (!acc.host || !acc.username || !acc.password) {
			throw new Error(`Account "${name}" in credentials file is missing required fields (host, username, password)`);
		}
	}

	return credentials;
}

function resolveAccount(task:any, credentials:any) {
	var account = task.account;

	if (typeof account === 'string') {
		if (!credentials) {
			throw new Error(`Account "${account}" requires a credentials file. Use --creds to specify one.`);
		}
		if (!credentials[account]) {
			throw new Error(`Account "${account}" not found in credentials file. Available accounts: ${Object.keys(credentials).join(', ')}`);
		}
		console.log(`Using account: "${account}" (host: ${credentials[account].host})`);
		return credentials[account];
	}

	if (typeof account === 'object' && account !== null) {
		console.warn(`⚠  WARNING: Inline credentials detected for task "${task.name}". Consider using a named account in .ftp-credentials.json instead.`);
		if (!account.host || !account.username || !account.password) {
			throw new Error(`Inline account for task "${task.name}" is missing required fields (host, username, password)`);
		}
		return account;
	}

	throw new Error(`Task "${task.name}" has an invalid account configuration`);
}

async function run(configPath:string, credentials:any) {
	
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	// Merge environment variables
	// const env = { ...process.env, ...config.env };
	for (const task of config.tasks) {
		console.log(`\n=============== Running task: ${task.name} ===============`);
		try {
			var cwd = config.cwd;
			cwd = path.resolve(__dirname, cwd);
			if(task.cwd) cwd = path.resolve(cwd, task.cwd);
			if (task.type === 'batch') {
				await runBatch(task.command, task.args || [], cwd, config.env);
			} else if (task.type === 'zip') {
				await runZip(cwd, task);
			} else if (task.type === 'upload') {
				var account = resolveAccount(task, credentials);
				await runUpload(cwd, task, account);
			} else if (task.type === 'http') {
				await runHttp(task);
			} else {
				throw new Error(`Unknown task type: ${task.type}`);
			}
			console.log(`\n=============== task: ${task.name} ✅ ===============`);
		} catch (err) {
			var message = err.message;
			if(!message) message = err.toString();
			console.error(`Task "${task.name}" failed:`, message, "❌");
			console.log(`\n=============== task: ${task.name} ❌ ===============`);
			process.exit(1); // terminate immediately
		}
	}

	console.log('\n✅ All tasks completed successfully');
}

function runBatch(command:string, args:string[], cwd:string, env:any) {
	return new Promise((resolve, reject) => {
		const savedPATH = process.env.PATH;
		const customEnv = {
			...process.env,
			...env
		};
		for (const [key, value] of Object.entries(customEnv)) {
			if (typeof value === 'string') {
				customEnv[key] = value.replace(/%([^%]+)%/g, (_, name) => {
					if (name === 'PATH') return savedPATH;
					return customEnv[name] || '';
				});
			}
		}
		console.log(cwd+">"+command, args.join(" "));
		const child = spawn(
			command, 
			args,
			// ['/c', batPath], 
			{
				cwd: cwd,
				env: customEnv,
				shell: true,
				stdio: ['pipe', 'pipe', 'pipe'] // give us stdin/out/err streams
			}
		);
		
		// Forward child output to our console
		child.stdout.on('data', data => process.stdout.write(data));
		child.stderr.on('data', data => process.stderr.write(data));
		
		// Capture keystrokes from *this* Node process and forward them
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.on('data', chunk => {
				child.stdin.write(chunk);
			});
		}
		
		// Handle exit
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error(`Batch command failed with code ${code}`));
			} else {
				resolve(null);
			}
		});
		
		/*
		console.log("command", command, "args", args);
		const child = spawn(command, args, { cwd, env, shell: true });
		child.stdout.on('data', data => process.stdout.write(data));
		child.stderr.on('data', data => process.stderr.write(data));
		child.on('close', code => {
			if (code !== 0) reject(new Error(`Batch command failed with code ${code}`));
			else resolve();
		});
		*/
	});
}

function runZip(cwd:string, task:any) {
	
	return new Promise((resolve, reject) => {
		var outputFile = path.resolve(cwd, task.output);
		fs.mkdirSync(path.dirname(outputFile), { recursive: true });

		var outputZip = new JSZip();
		var items = task.items;
		var promises:any [] = [];

		items.forEach((item:any) => {
			var fullPath = path.resolve(cwd, item.path);
			if(item.type == "file")
			{
				var name = item.output || item.path;
				console.log("writing file", item.path, "as", name);
				outputZip.file(name, fs.readFileSync(fullPath));
			}
			else if(item.type == "folder")
			{
				var prefix = item.output || "";
				console.log("writing folder", item.path, "to", prefix);
				var walkDir = function(dir, baseDir) {
					var entries = fs.readdirSync(dir, { withFileTypes: true });
					for (const entry of entries) {
						var fullEntry = path.join(dir, entry.name);
						if (entry.isDirectory()) {
							walkDir(fullEntry, path.join(baseDir, entry.name));
						} else if (entry.isFile()) {
							var zipName = prefix ? prefix + '/' + path.join(baseDir, entry.name).replace(/\\/g, '/') : path.join(baseDir, entry.name).replace(/\\/g, '/');
							outputZip.file(zipName, fs.readFileSync(fullEntry));
						}
					}
				};
				walkDir(fullPath, '');
			}
			else if(item.type == "zip")
			{
				console.log("extracting and writing zip", item.path);
				promises.push(
					JSZip.loadAsync(fs.readFileSync(fullPath)).then(zip => {
						var tasks = [];
						zip.forEach((relativePath, entry) => {
							if (!entry.dir) {
								tasks.push(
									entry.async('nodebuffer').then(content => {
										console.log("  adding", entry.name);
										outputZip.file(entry.name, content);
									})
								);
							}
						});
						return Promise.all(tasks);
					})
				);
			}
		});

		Promise.all(promises).then((data:any []) => {
			const out = fs.createWriteStream(outputFile);
			out.on('close', resolve);
			out.on('error', reject);
			outputZip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
				.pipe(out);
		}).catch(reject);
	});
}

async function runUpload(cwd:string, task:any, account:any) {
	console.log("trying to connect to FTP");
	// var masked = { ...account, password: '***' };
	// console.log("connecting with", masked);
	var client = new FTPClient(account);
	console.log("connecting");
	await client.connect();

	for (const entry of task.files) {
		var localPath, remoteName;
		if (typeof entry === 'string') {
			localPath = path.resolve(cwd, entry);
			remoteName = path.basename(entry);
			console.log("uploading file", entry, "to server", task.path);
			await client.upload(localPath, task.path + '/' + remoteName);
		} else if (entry.type === 'file') {
			localPath = path.resolve(cwd, entry.path);
			remoteName = entry.output || path.basename(entry.path);
			console.log("uploading file", entry.path, "to server", task.path);
			await client.upload(localPath, task.path + '/' + remoteName);
		} else if (entry.type === 'direct') {
			var dirPath = path.resolve(cwd, entry.path);
			console.log("uploading directory", entry.path, "to server", task.path);
			var files = fs.readdirSync(dirPath, { recursive: true });
			for (const f of files) {
				var fullPath = path.resolve(dirPath, f);
				if (fs.statSync(fullPath).isFile()) {
					await client.upload(fullPath, task.path + '/' + f.replace(/\\/g, '/'));
				}
			}
		}
	}

	client.close();
}

async function runHttp(task) {
	const res = await fetch(task.url, {
		method: task.method || 'GET',
		headers: task.headers || {},
		body: task.body ? JSON.stringify(task.body) : undefined
	});
	var text = await res.text();
	console.log("text", text);
	if (!res.ok)
	{
		throw new Error(`HTTP request failed: ${res.status}`);
	}
}

async function start()
{
	try{
		program
			.option('-c, --config <path>', 'Path to config file')
			.option('--creds <path>', 'Path to credentials file (default: .ftp-credentials.json)')
			.parse(process.argv);
		const options = program.opts();
		
		if (options.config) {
			console.log('Config file:', options.config);
			var credentials = null;
			var credsPath = options.creds || path.resolve(process.cwd(), '.ftp-credentials.json');
			if (fs.existsSync(credsPath)) {
				console.log('Credentials file:', credsPath);
				credentials = loadCredentials(credsPath);
				console.log('Loaded', Object.keys(credentials).length, 'account(s):', Object.keys(credentials).join(', '));
			} else if (options.creds) {
				throw new Error(`Credentials file not found: ${credsPath}`);
			} else {
				console.log('No credentials file found at', credsPath, '- using inline credentials if present');
			}
			await run(options.config, credentials);
		} else {
			console.error("missing config");
			process.exit(1); // terminate immediately
		}
		console.log("END");
		process.exit(0);
	} catch(reason)
	{
		console.error(reason);
		process.exit(1);
	}
	

}

start();