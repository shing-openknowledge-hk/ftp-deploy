import dotenv from "dotenv";
dotenv.config();

export interface IEnvironment {
	GOOGLE_CLOUD_ENDPOINT:string;
	GOOGLE_CLOUD_PROJECT:string;
	GOOGLE_CLOUD_LOCATION:string;
	ALLOWED_IPS:string;
	ALLOWED_DDNS:string;
	SERVER_JWT: string;
	CACHE_TTL: number;
	API_ENDPOINT: string;
	NODE_ENV: string;
	CRON_JOB: string;
	TIMEZONE: string;
	API_PORT: number;
	LOG_DIR: string;
	DB_HOST: string;
	DB_USER: string;
	DB_PASSWORD: string;
	DB_PORT: number;
	DB_NAME: string;
	DB_DIALECT: string;
	CRON_ENABLED: boolean;
}

export class Environment {
	static getEnvString(obj: any, name: string, defaultValue = ""): string {
		return obj?.[name] ?? defaultValue;
	}

	static getEnvNumber(obj: any, name: string, defaultValue = 0): number {
		const raw = obj?.[name];
		const parsed = Number(raw);
		return raw !== undefined && !isNaN(parsed) ? parsed : defaultValue;
	}

	static getEnvBoolean(obj: any, name: string, defaultValue = false): boolean {
		const value = obj?.[name];
		if (!value) return defaultValue;
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

	static load(): IEnvironment {
		const env = process.env;

		// Define config schema once
		const schema: Record<keyof IEnvironment, { type: "string" | "number" | "boolean"; default: any }> = {
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
		const result:any = {} as IEnvironment;
		for (const key in schema) {
			const { type, default: def } = schema[key as keyof IEnvironment];
			switch (type) {
				case "string":
					result[key as keyof IEnvironment] = this.getEnvString(env, key, def) as any;
					break;
				case "number":
					result[key as keyof IEnvironment] = this.getEnvNumber(env, key, def) as any;
					break;
				case "boolean":
					result[key as keyof IEnvironment] = this.getEnvBoolean(env, key, def) as any;
					break;
			}
		}

		return result;
	}
}

export const environment: IEnvironment = Environment.load();
