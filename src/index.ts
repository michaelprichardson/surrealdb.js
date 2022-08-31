import guid from "./utils/guid";
import errors from "./errors/index.js";
import Live from "./classes/live.js";
import Socket from "./classes/socket.js";
import Pinger from "./classes/pinger.js";
import Emitter from "./classes/emitter.js";
import { SurrealArgs, SurrealOperation, SurrealResult } from "./utils/types";
import { getId } from "./utils/strings";

let singleton: Surreal | undefined = undefined;

export default class Surreal extends Emitter {

	// ------------------------------
	// Main singleton
	// ------------------------------

	static get Instance() {
		return singleton ? singleton : singleton = new Surreal();
	}

	// ------------------------------
	// Public types
	// ------------------------------

	static get AuthenticationError() {
		return errors.AuthenticationError;
	}

	static get PermissionError() {
		return errors.PermissionError;
	}

	static get RecordError() {
		return errors.RecordError;
	}

	static get Live() {
		return Live;
	}

	// ------------------------------
	// Properties
	// ------------------------------

	#ws: Socket | undefined = undefined;

	#url: string | undefined = undefined;

	#token: string | undefined = undefined;

	#pinger: Pinger | undefined = undefined;

	#attempted: Promise<void>;

	// ------------------------------
	// Accessors
	// ------------------------------

	get token() {
		return this.#token;
	}

	set token(token) {
		this.#token = token;
	}

	// ------------------------------
	// Methods
	// ------------------------------

	constructor(url?: string, token?: string) {
		super();

		this.#url = url;
		this.#token = token;

		if (url) {
			this.connect(url);
		}
	}

	connect(url: string): Promise<void> {

		// Next we setup the websocket connection
		// and listen for events on the socket,
		// specifying whether logging is enabled.
		this.#ws = new Socket(url);

		// Setup the interval pinger so that the
		// connection is kept alive through
		// loadbalancers and proxies.
		this.#pinger = new Pinger(30000);

		// When the connection is opened we
		// need to attempt authentication if
		// a token has already been applied.
		this.#ws.on("open", () => {
			this.#init();
		});

		// When the connection is opened we
		// change the relevant properties
		// open live queries, and trigger.
		this.#ws.on("open", () => {
			this.emit("open");
			this.emit("opened");

			this.#pinger?.start(() => {
				this.ping();
			});
		});

		// When the connection is closed we
		// change the relevant properties
		// stop live queries, and trigger.
		this.#ws.on("close", () => {
			this.emit("close");
			this.emit("closed");

			this.#pinger?.stop();
		});

		// When we receive a socket message
		// we process it. If it has an ID
		// then it is a query response.
		this.#ws.on("message", (e) => {
			let d = JSON.parse(e.data);

			if (d.method !== "notify") {
				return this.emit(d.id, d);
			}

			if (d.method === "notify") {
				return d.params.forEach(r => {
					this.emit("notify", r);
				});
			}
		});

		// Open the websocket for the first
		// time. This will automatically
		// attempt to reconnect on failure.
		this.#ws.open();

		//
		//
		//
		return this.wait();
	}

	// --------------------------------------------------
	// Public methods
	// --------------------------------------------------

	sync(query: string, vars: SurrealArgs): Live {
		return new Live(this, query, vars);
	}

	wait(): Promise<void> {
		return this.#getWebsocket().then(() => {
			return this.#attempted;
		});
	}

	close(): void {
		this.#ws?.removeAllListeners();
		this.#ws?.close();
	}

	// --------------------------------------------------

	ping(): Promise<void> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise(() => {
				this.#send(id, "ping");
			});
		});
	}

	use(ns: string, db: string): Promise<void> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "use", [ns, db]);
			});
		});
	}

	info() {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "info");
			});
		});
	}

	signup(vars: SurrealArgs): Promise<string> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#signup(res, resolve, reject));
				this.#send(id, "signup", [vars]);
			});
		});
	}

	signin(vars: SurrealArgs): Promise<string> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#signin(res, resolve, reject));
				this.#send(id, "signin", [vars]);
			});
		});
	}

	invalidate(): Promise<void> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#auth(res, resolve, reject));
				this.#send(id, "invalidate");
			});
		});
	}

	authenticate(token: string): Promise<void> {
		let id = guid();
		return this.#getWebsocket().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#auth(res, resolve, reject));
				this.#send(id, "authenticate", [token]);
			});
		});
	}

	// --------------------------------------------------

	live(table: string) {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "live", [table]);
			});
		});
	}

	kill(query: string): Promise<void> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "kill", [query]);
			});
		});
	}

	let(key: string, val: any) {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "let", [key, val]);
			});
		});
	}

	query(query: string, vars: SurrealArgs) {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#result(res, resolve, reject));
				this.#send(id, "query", [query, vars]);
			});
		});
	}

	// TODO: Might be worth expanding into different methods for single and multiple
	select<T>(thing: string): Promise<T | Array<T>> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Select, thing, resolve, reject));
				this.#send(id, "select", [thing]);
			});
		});
	}

	create<T>(thing: string, data: SurrealArgs): Promise<string | T> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Create, thing, resolve, reject));
				this.#send(id, "create", [thing, data]);
			});
		});
	}

	update<T>(thing: string, data: SurrealArgs): Promise<T | Array<T>> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Update, thing, resolve, reject));
				this.#send(id, "update", [thing, data]);
			});
		});
	}

	change<T>(thing: string, data: SurrealArgs): Promise<T | Array<T>> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Change, thing, resolve, reject));
				this.#send(id, "change", [thing, data]);
			});
		});
	}

	modify<T>(thing: string, data: SurrealArgs): Promise<T | Array<T>> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Modify, thing, resolve, reject));
				this.#send(id, "modify", [thing, data]);
			});
		});
	}

	delete(thing: string): Promise<void> {
		let id = guid();
		return this.wait().then(() => {
			return new Promise((resolve, reject) => {
				this.once(id, res => this.#output(res, SurrealOperation.Delete, thing, resolve, reject));
				this.#send(id, "delete", [thing]);
			});
		});
	}

	// --------------------------------------------------
	// Private methods
	// --------------------------------------------------

	#getWebsocket(): Promise<any> {
		if (!this.#ws) {
			throw Error('You need to connect to the surrealdb before making any calls!');
		}
		return this.#getWebsocket()!
	}

	#init() {
		this.#attempted = new Promise((res, rej) => {
			this.#token ? this.authenticate(this.#token).then(res).catch(res) : res();
		});
	}

	#send(id: string, method: string, params: any[] = []) {
		this.#ws!.send(JSON.stringify({
			id: id,
			method: method,
			params: params,
		}));
	}

	#auth(res: SurrealResult, resolve: (value: any) => void, reject: (reason: any) => void) {
		if (res.error) {
			return reject(new Surreal.AuthenticationError(res.error.message));
		} else {
			return resolve(res.result);
		}
	}

	#signin(res: SurrealResult, resolve: (value: any) => void, reject: (reason: any) => void) {
		if (res.error) {
			return reject(new Surreal.AuthenticationError(res.error.message));
		} else {
			this.#token = res.result;
			return resolve(res.result);
		}
	}

	#signup(res: SurrealResult, resolve: (value: any) => void, reject: (reason: any) => void) {
		if (res.error) {
			return reject(new Surreal.AuthenticationError(res.error.message));
		} else if (res.result) {
			this.#token = res.result;
			return resolve(res.result);
		}
	}

	#result(res: SurrealResult, resolve: (value?: any) => void, reject: (reason: any) => void) {
		if (res.error) {
			return reject(new Error(res.error.message));
		} else if (res.result) {
			return resolve(res.result);
		}
		return resolve();
	}

	#output<T>(res: SurrealResult, type: SurrealOperation, thing: string, resolve: (value?: any) => void, reject: (reason: any) => void) {
		if (res.error) {
			return reject(new Error(res.error.message));
		} else if (res.result) {
			const id = getId(thing);

			switch (type) {
				case SurrealOperation.Delete:
					return resolve();
				case SurrealOperation.Create:
					return res.result && res.result.length ? resolve(res.result[0]) : reject(
						new Surreal.PermissionError(`Unable to create record: ${id}`)
					);
				case SurrealOperation.Update:
					if (id) {
						return res.result && res.result.length ? resolve(res.result[0]) : reject(
							new Surreal.PermissionError(`Unable to update record: ${id}`)
						);
					}
					return resolve(res.result);
				case SurrealOperation.Change:
					if (id) {
						return res.result && res.result.length ? resolve(res.result[0]) : reject(
							new Surreal.PermissionError(`Unable to update record: ${id}`)
						);
					}
					return resolve(res.result);
				case SurrealOperation.Modify:
					if (id) {
						return res.result && res.result.length ? resolve(res.result[0]) : reject(
							new Surreal.PermissionError(`Unable to update record: ${id}`)
						);
					}
					return resolve(res.result);
				default:
					if (id) {
						return res.result && res.result.length ? resolve(res.result) : reject(
							new Surreal.RecordError(`Record not found: ${id}`)
						);
					}
					return resolve(res.result);
			}
		}
		return resolve();
	}

}
