import dotenv from "dotenv";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { Console } from "winston/lib/winston/transports";
import fs from "fs";
import { environment } from "./Environment";

// const fs = require('fs');
// require('winston-daily-rotate-file');
// const winston = require('winston');
dotenv.config();

export class LogSymbol{
	static OK = "✅";	
	static INFO = "💡";
	static WARN = "🔥";
	static ERROR = "❌";
	static DEBUG = "🐞";
	static VERBOSE = "⬤"; // ⬤🟢
	static HTTP = "📶"; //🌐 📶 🛜 🖧 🔗
}

export function getCallerInfo(stack:string, offset:number = 2):string
{
	stack = stack.replace(/\\/g, "/");
	const stackLines = stack.split('\n');
	// console.log(stackLines);
	// The caller is usually the third line in the stack trace
	if(stackLines.length > offset) {
		const callerLine = stackLines[offset].trim();
		// Example line: at Object.<anonymous> (C:\path\to\file.js:10:15)
		// let match = callerLine.match(/\((.*):(\d+):(\d+)\)/);
		
		let match = callerLine.match(/\((.*):(\d+):(\d+)\)/);
		// Or without parentheses: at path:line:col
		if (!match) {
			match = callerLine.match(/at (.*):(\d+):(\d+)/);
		}

		if (match && match.length === 4) {
			const filePath = match[1];
			const lineNumber = match[2];
			// const columnNumber = match[3];
			const fileName = filePath.split('/').pop()?.split('\\').pop(); // Handle both Unix and Windows paths
			return `${fileName}:${lineNumber}`;
		}
	}
	return '';
}

const log_dir = environment.LOG_DIR;
if(!fs.existsSync(log_dir)) {
	fs.mkdirSync(log_dir);
}


function formatTextMessage(info:any):string
{
	var message:any = info.message;
	var caller = message.caller || "";
	// if content is string, print directly
	if(typeof message.content === 'string')
	{
		return `${info.timestamp} - ${info.level}: ${caller} - ${message.symbol} ${message.content}`;
	} else 
	{
		return `${info.timestamp} - ${info.level}: ${caller} - ${message.symbol} ${JSON.stringify(message.content)}`;
	}
}
const consoleTransport = new Console({
	// level: 'info',
	// level: 'http',
	level :'verbose',
	handleExceptions: true,
	format: winston.format.combine(
		winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		winston.format.colorize(),
		winston.format.printf(formatTextMessage)
	)
})

const transport = new DailyRotateFile({
	level: 'info',
	filename: `${log_dir}/app-%DATE%.log`,
	datePattern: 'YYYY-MM-DD',
	zippedArchive: true,
	maxSize: '10m', // rotates if file exceeds 10MB
	maxFiles: '30d', // keeps logs for 30 days,
	format: winston.format.combine(
		winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		winston.format.printf(formatTextMessage)
	)
});

const jsonTransport = new DailyRotateFile({
	level:"info",
	filename: `${log_dir}/app-%DATE%.json.log`,
	datePattern: 'YYYY-MM-DD',
	zippedArchive: true,
	maxSize: '10m', // rotates if file exceeds 10MB
	maxFiles: '30d', // keeps logs for 30 days,
	format: winston.format.combine(
		winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		winston.format.json()
	)
});

const logger = winston.createLogger({
	// level: 'info',
	level: 'http',
	transports: [jsonTransport, consoleTransport, transport]
});

const consoleLogger = winston.createLogger({
	// level: 'info',
	level: 'http',
	transports: [consoleTransport]
});


class LogCaller{
	logger:any;
	constructor(loggerInstance?:any) {
		// console.log("Logger initialized");
		this.logger = loggerInstance;
		this.init();
	}
	init() {
		// console.log("Binding logger methods");
		this.logger.log = this.bindTwo(this.logger.log);
		this.logger.info = this.bindOne(this.logger.info, LogSymbol.INFO);
		this.logger.warn = this.bindOne(this.logger.warn, LogSymbol.WARN);
		this.logger.error = this.bindOne(this.logger.error, LogSymbol.ERROR);
		this.logger.debug = this.bindOne(this.logger.debug, LogSymbol.DEBUG);
		this.logger.verbose = this.bindOne(this.logger.verbose, LogSymbol.VERBOSE);
		this.logger.http = this.bindOne(this.logger.http, LogSymbol.HTTP);
		
 	}
	getSymbol(level:string):string
	{
		switch(level) {
			case 'info':
				return LogSymbol.INFO;
			case 'warn':
				return LogSymbol.WARN;
			case 'error':
				return LogSymbol.ERROR;
			case 'debug':
				return LogSymbol.DEBUG;
			default:
				return "";
		}
	}
	bindTwo(fn:Function)
	{
		
		return (type:string, data:any) => {
			var symbol = this.getSymbol(type);
			const err = new Error();
			var callerInfo = getCallerInfo(err.stack || '',  2);
			fn.call(
				this.logger, 
				type,
				{message:{caller: callerInfo, content:data, symbol: symbol}}
			);
		}
	}
	
	bindOne(fn:Function, symbol:string)
	{
		return (data:any) => {
			// if data is Error, extract message and stack
			if(data instanceof Error) {
				const err = data as Error;
				var callerInfo = getCallerInfo(err.stack || '',  1);
				data = data.message;
			} else {
				const err = new Error();
				var callerInfo = getCallerInfo(err.stack || '',  2);
			}
			fn.call(
				this.logger, 
				{caller: callerInfo, content:data, symbol: symbol}
				
			);
		}
	}

	/*
		return index.ts:45
	 */
	

}

var wrapper = new LogCaller(logger);

export { logger , consoleLogger};
