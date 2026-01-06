// import { app } from "@azure/functions";
import { connect } from "node:http2";

export class DoProudGETRequest {
	constructor(obj) {
		this.urlObj = new URL(obj.href);
		this.cookie = obj.cookie;
	}

	async getData() {
		const p = Promise.withResolvers();
		const clientSession = connect(this.urlObj.href);

		let promiseSettled = false;

		clientSession.on("error", (err) => {
			console.error("Session error:", err);
			if (!promiseSettled) {
				promiseSettled = true;
				p.reject(err.message);
			}
		});

		const obj = {
			":authority": this.urlObj.host,
			":method": "GET",
			":path": this.urlObj.pathname + this.urlObj.search,
			":scheme": "https",
			...(this.cookie
				? {
						Cookie: this.cookie.map((c) => c.split("; ")[0]).join("; "),
					}
				: {}),
		};
		const req = clientSession.request(obj);

		req.on("error", (e) => {
			console.log(`problem with GET request:`, {
				msg: e.message,
				code: e.code,
				errno: e.errno,
				stack: e.stack,
			});

			if (!clientSession.destroyed) {
				clientSession.close();
			}

			if (!promiseSettled) {
				promiseSettled = true;
				if (e.code === "ECONNRESET") {
					p.reject("Connection reset by server");
				} else {
					p.reject(e.message);
				}
			}
		});

		let incomingBodyStr = "";

		const p1 = Promise.withResolvers();
		
		req.on("data", (chunk) => (incomingBodyStr += chunk));
		
		req.on("end", p1.resolve);

		req.on("response", async (headers) => {
			await p1.promise;

			clientSession.close();

			if (!promiseSettled) {
				promiseSettled = true;
				p.resolve({
					location: headers["location"],
					setCookie: headers["set-cookie"],
					headers,
					body: incomingBodyStr,
				});
			}
		});

		req.end();

		return p.promise;
	}
}