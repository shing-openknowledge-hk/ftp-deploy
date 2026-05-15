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
			throw new Error(`Account "${account}" requires a credentials file. Create a .ftp-credentials.json or use --creds to specify one.`);
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

function getGroupNames(task: any): string[] {
	if (!task.group) return [];
	if (Array.isArray(task.group)) return task.group;
	return [task.group];
}

function filterTasks(tasks: any[], options: any): any[] {
	var filtered = tasks;

	if (options.task && options.task.length > 0) {
		var names = options.task;
		var missing = names.filter(n => !tasks.some(t => t.name === n));
		if (missing.length > 0) {
			var available = tasks.map(t => t.name).join(', ');
			throw new Error(`Unknown task(s): ${missing.join(', ')}. Available: ${available}`);
		}
		filtered = filtered.filter(t => names.includes(t.name));
		console.log(`🎯 Running specific tasks: ${names.join(', ')}`);
	}

	if (options.group && options.group.length > 0) {
		var groups = options.group;
		var hasGroup = tasks.some(t => getGroupNames(t).length > 0);
		if (!hasGroup) {
			console.warn(`⚠  --group specified but no tasks have a "group" property`);
		}
		filtered = filtered.filter(t => getGroupNames(t).some(g => groups.includes(g)));
		console.log(`🎯 Running groups: ${groups.join(', ')}`);
	}

	if (options.from) {
		var fromIdx = tasks.findIndex(t => t.name === options.from);
		if (fromIdx === -1) {
			var available = tasks.map(t => t.name).join(', ');
			throw new Error(`--from task "${options.from}" not found. Available: ${available}`);
		}
		filtered = filtered.filter(t => tasks.indexOf(t) >= fromIdx);
		console.log(`🎯 Running tasks from: "${options.from}"`);
	}

	if (options.to) {
		var toIdx = tasks.findIndex(t => t.name === options.to);
		if (toIdx === -1) {
			var available = tasks.map(t => t.name).join(', ');
			throw new Error(`--to task "${options.to}" not found. Available: ${available}`);
		}
		filtered = filtered.filter(t => tasks.indexOf(t) <= toIdx);
		console.log(`🎯 Running tasks up to: "${options.to}"`);
	}

	if (options.skip && options.skip.length > 0) {
		filtered = filtered.filter(t => !options.skip.includes(t.name));
		console.log(`⏭️  Skipping tasks: ${options.skip.join(', ')}`);
	}

	return filtered;
}

async function run(configPath: string, credentials: any, filterOptions: any) {
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	console.log(`=============== ${config.name} ===============`);

	var tasks = filterTasks(config.tasks, filterOptions);
	if (tasks.length === 0) {
		console.error("❌ No tasks match the specified filters");
		process.exit(1);
	}
	console.log(`🎯 Running ${tasks.length} of ${config.tasks.length} total tasks`);

	for (const task of tasks) {
		console.log(`\n=============== Running task: ${task.name} ===============`);
		try {
			var cwd = config.cwd;
			cwd = path.resolve(process.cwd(), cwd);
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
			process.exit(1);
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

	if (task.path && task.mkdir) {
		try {
			await client.mkdir(task.path, true);
		} catch (_) {}
	}

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
			.option('-t, --task <names...>', 'Run only specific tasks by name')
			.option('--skip <names...>', 'Skip specific tasks by name')
			.option('-g, --group <names...>', 'Run tasks belonging to specific groups')
			.option('-l, --list', 'List all available tasks and exit')
			.option('--from <name>', 'Run all tasks starting from this task (inclusive)')
			.option('--to <name>', 'Run all tasks up to this task (inclusive)')
			.parse(process.argv);
		const options = program.opts();
		
		if (options.list) {
			if (!options.config) {
				console.error("--list requires --config to read the task list");
				process.exit(1);
			}
			var config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
			console.log('📋 Available tasks:');
			config.tasks.forEach((t: any, i: number) => {
				var groups = getGroupNames(t);
				var groupStr = groups.length > 0 ? ` [groups: ${groups.join(', ')}]` : '';
				console.log(`  ${i + 1}. ${t.name} (${t.type})${groupStr}`);
			});
			process.exit(0);
		}
		
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
			}
			await run(options.config, credentials, options);
		} else {
			console.error("missing config");
			process.exit(1);
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