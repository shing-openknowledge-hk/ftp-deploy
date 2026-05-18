"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consoleLogger = exports.logger = exports.LogSymbol = void 0;
exports.getCallerInfo = getCallerInfo;
const dotenv_1 = __importDefault(require("dotenv"));
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const transports_1 = require("winston/lib/winston/transports");
const fs_1 = __importDefault(require("fs"));
const Environment_1 = require("./Environment");
// const fs = require('fs');
// require('winston-daily-rotate-file');
// const winston = require('winston');
dotenv_1.default.config();
class LogSymbol {
}
exports.LogSymbol = LogSymbol;
LogSymbol.OK = "✅";
LogSymbol.INFO = "💡";
LogSymbol.WARN = "🔥";
LogSymbol.ERROR = "❌";
LogSymbol.DEBUG = "🐞";
LogSymbol.VERBOSE = "⬤"; // ⬤🟢
LogSymbol.HTTP = "📶"; //🌐 📶 🛜 🖧 🔗
function getCallerInfo(stack, offset = 2) {
    stack = stack.replace(/\\/g, "/");
    const stackLines = stack.split('\n');
    // console.log(stackLines);
    // The caller is usually the third line in the stack trace
    if (stackLines.length > offset) {
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
const log_dir = Environment_1.environment.LOG_DIR;
if (!fs_1.default.existsSync(log_dir)) {
    fs_1.default.mkdirSync(log_dir);
}
function formatTextMessage(info) {
    var message = info.message;
    var caller = message.caller || "";
    // if content is string, print directly
    if (typeof message.content === 'string') {
        return `${info.timestamp} - ${info.level}: ${caller} - ${message.symbol} ${message.content}`;
    }
    else {
        return `${info.timestamp} - ${info.level}: ${caller} - ${message.symbol} ${JSON.stringify(message.content)}`;
    }
}
const consoleTransport = new transports_1.Console({
    // level: 'info',
    // level: 'http',
    level: 'verbose',
    handleExceptions: true,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.colorize(), winston_1.default.format.printf(formatTextMessage))
});
const transport = new winston_daily_rotate_file_1.default({
    level: 'info',
    filename: `${log_dir}/app-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '10m', // rotates if file exceeds 10MB
    maxFiles: '30d', // keeps logs for 30 days,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(formatTextMessage))
});
const jsonTransport = new winston_daily_rotate_file_1.default({
    level: "info",
    filename: `${log_dir}/app-%DATE%.json.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '10m', // rotates if file exceeds 10MB
    maxFiles: '30d', // keeps logs for 30 days,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.json())
});
const logger = winston_1.default.createLogger({
    // level: 'info',
    level: 'http',
    transports: [jsonTransport, consoleTransport, transport]
});
exports.logger = logger;
const consoleLogger = winston_1.default.createLogger({
    // level: 'info',
    level: 'http',
    transports: [consoleTransport]
});
exports.consoleLogger = consoleLogger;
class LogCaller {
    constructor(loggerInstance) {
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
    getSymbol(level) {
        switch (level) {
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
    bindTwo(fn) {
        return (type, data) => {
            var symbol = this.getSymbol(type);
            const err = new Error();
            var callerInfo = getCallerInfo(err.stack || '', 2);
            fn.call(this.logger, type, { message: { caller: callerInfo, content: data, symbol: symbol } });
        };
    }
    bindOne(fn, symbol) {
        return (data) => {
            // if data is Error, extract message and stack
            if (data instanceof Error) {
                const err = data;
                var callerInfo = getCallerInfo(err.stack || '', 1);
                data = data.message;
            }
            else {
                const err = new Error();
                var callerInfo = getCallerInfo(err.stack || '', 2);
            }
            fn.call(this.logger, { caller: callerInfo, content: data, symbol: symbol });
        };
    }
}
var wrapper = new LogCaller(logger);
