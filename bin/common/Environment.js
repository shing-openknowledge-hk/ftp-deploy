"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.environment = exports.Environment = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class Environment {
    static getEnvString(obj, name, defaultValue = "") {
        return obj?.[name] ?? defaultValue;
    }
    static getEnvNumber(obj, name, defaultValue = 0) {
        const raw = obj?.[name];
        const parsed = Number(raw);
        return raw !== undefined && !isNaN(parsed) ? parsed : defaultValue;
    }
    static getEnvBoolean(obj, name, defaultValue = false) {
        const value = obj?.[name];
        if (!value)
            return defaultValue;
        switch (value.toLowerCase()) {
            case "true":
            case "1":
            case "yes":
            case "on":
                return true;
            case "false":
            case "0":
            case "no":
            case "off":
                return false;
            default:
                return defaultValue;
        }
    }
    static load() {
        const env = process.env;
        // Define config schema once
        const schema = {
            GOOGLE_CLOUD_ENDPOINT: { type: "string", default: "" },
            GOOGLE_CLOUD_PROJECT: { type: "string", default: "" },
            GOOGLE_CLOUD_LOCATION: { type: "string", default: "" },
            ALLOWED_IPS: { type: "string", default: "127.0.0.1,::1" },
            ALLOWED_DDNS: { type: "string", default: "" },
            SERVER_JWT: { type: "string", default: "" },
            CACHE_TTL: { type: "number", default: 30000 },
            API_ENDPOINT: { type: "string", default: "" },
            NODE_ENV: { type: "string", default: "development" },
            CRON_JOB: { type: "string", default: "0 0 * * 0" },
            TIMEZONE: { type: "string", default: "UTC" },
            API_PORT: { type: "number", default: 3000 },
            LOG_DIR: { type: "string", default: "./logs" },
            DB_HOST: { type: "string", default: "localhost" },
            DB_USER: { type: "string", default: "root" },
            DB_PASSWORD: { type: "string", default: "" },
            DB_PORT: { type: "number", default: 3306 },
            DB_NAME: { type: "string", default: "test" },
            DB_DIALECT: { type: "string", default: "mysql" },
            CRON_ENABLED: { type: "boolean", default: false },
        };
        // Build environment object dynamically
        const result = {};
        for (const key in schema) {
            const { type, default: def } = schema[key];
            switch (type) {
                case "string":
                    result[key] = this.getEnvString(env, key, def);
                    break;
                case "number":
                    result[key] = this.getEnvNumber(env, key, def);
                    break;
                case "boolean":
                    result[key] = this.getEnvBoolean(env, key, def);
                    break;
            }
        }
        return result;
    }
}
exports.Environment = Environment;
exports.environment = Environment.load();
