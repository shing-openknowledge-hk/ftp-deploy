const moment = require('moment');
const fs = require('fs');
const path = require('path');

export function resolveValue(template: string, context: any): any {
	if (typeof template !== 'string') return template;

	var result = template.replace(/\$\{([^}]+)\}/g, (match, expr) => {
		var val = evaluateExpression(expr.trim(), context);
		return val !== undefined ? String(val) : match;
	});

	return result;
}

export function evaluateExpression(expr: string, context: any): any {
	if (!expr) return '';

	var envMatch = expr.match(/^env\.(.+)$/);
	if (envMatch) {
		return process.env[envMatch[1]] || context.env?.[envMatch[1]] || '';
	}

	var varMatch = expr.match(/^vars\.(.+)$/);
	if (varMatch) {
		return context.vars?.[varMatch[1]] || context.globalVars?.[varMatch[1]] || '';
	}

	var outputMatch = expr.match(/^output\.(.+)$/);
	if (outputMatch) {
		return context.outputs?.[outputMatch[1]] || '';
	}

	var globalMatch = expr.match(/^globalVars\.(.+)$/);
	if (globalMatch) {
		return context.globalVars?.[globalMatch[1]] || '';
	}

	var nowMatch = expr.match(/^now\(['"](.+)['"]\)$/);
	if (nowMatch) {
		return moment().format(nowMatch[1]);
	}

	var nowMatch2 = expr.match(/^now\(\)$/);
	if (nowMatch2) {
		return moment().format('YYYY-MM-DD HH:mm:ss');
	}

	var basenameMatch = expr.match(/^basename\(['"](.+)['"]\)$/);
	if (basenameMatch) {
		return path.basename(basenameMatch[1]);
	}

	var dirnameMatch = expr.match(/^dirname\(['"](.+)['"]\)$/);
	if (dirnameMatch) {
		return path.dirname(dirnameMatch[1]);
	}

	var readFileMatch = expr.match(/^readFile\(['"](.+)['"]\)$/);
	if (readFileMatch) {
		try {
			return fs.readFileSync(readFileMatch[1], 'utf8').trim();
		} catch (_) {
			return '';
		}
	}

	var pipeMatch = expr.match(/^(.+?)\s*\|\s*(.+)$/);
	if (pipeMatch) {
		var val = evaluateExpression(pipeMatch[1].trim(), context);
		var fn = pipeMatch[2].trim();
		if (fn === 'trim') return String(val).trim();
		if (fn === 'upper') return String(val).toUpperCase();
		if (fn === 'lower') return String(val).toLowerCase();
		return val;
	}

	if (expr.startsWith('"') && expr.endsWith('"')) {
		return expr.slice(1, -1);
	}

	if (/^\d+$/.test(expr)) return parseInt(expr, 10);
	if (/^\d+\.\d+$/.test(expr)) return parseFloat(expr);

	var fromVars = context.vars?.[expr] ?? context.globalVars?.[expr] ?? context.outputs?.[expr];
	if (fromVars !== undefined) return fromVars;

	return '';
}

export function resolveObject(obj: any, context: any): any {
	if (typeof obj === 'string') return resolveValue(obj, context);
	if (Array.isArray(obj)) return obj.map(item => resolveObject(item, context));
	if (obj !== null && typeof obj === 'object') {
		var result: any = {};
		for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				result[key] = resolveObject(obj[key], context);
			}
		}
		return result;
	}
	return obj;
}

export function resolveTask(task: any, context: any): any {
	return resolveObject(task, context);
}
