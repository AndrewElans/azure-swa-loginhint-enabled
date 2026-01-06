import http from 'node:http';
import { DoProudGETRequest } from './functions/customLogin.js';

const port = process.env.PORT || 3000;

const resFns = {
    fn200: function (client, urlObj) {
        client.res.setHeader(
            'Content-Type',
            this.contentType ?? contentTypes.html,
        );
        client.res.writeHead(200);
        client.res.end(
            this.jsonBody
                ? JSON.stringify(this.jsonBody)
                : (this.strBody ?? ''),
        );
    },
    fn404: (client) => {
        (client.res.writeHead(404, { 'Content-Type': 'text/plain' }),
            client.res.end('Not found'));
    },
};

const contentTypes = {
    json: 'application/json',
    html: 'text/html; charset=utf-8',
};

const routes = {
    GET: {
        '/api/message': resFns.fn200.bind({
			// test endpoint
            contentType: contentTypes.json,
            jsonBody: { testing: ['api/message'] },
        }),
        '/api/login-aad': async (client, urlObj) => {
            // e.g. api/login-aad?user=bing.whatman

            const originalUrl =
                'https://swa.azurestaticapps.net/.auth/login/aad';

            const user = urlObj.searchParams.get('user');

            if (!user) {
                client.res.writeHead(302, {
                    Location: originalUrl,
                });
                client.res.end();
                return;
            }

            const reqStep1 = new DoProudGETRequest({
                href: originalUrl,
            });
            const resStep1 = await reqStep1.getData();

            const reqStep2 = new DoProudGETRequest({
                href: resStep1.location,
                cookie: resStep1.setCookie,
            });
            const resStep2 = await reqStep2.getData();

            /*
				resStep1.setCookie -> staticWebAppsAuthContextCookie
				resStep2.setCookie -> nonce
				resStep2.location -> loginLocation 
			*/
            const location = resStep2.location
                .replace(
                    'prompt=select_account',
                    `login_hint=${user}@contoso.com`,
                )
                .replace(
                    'state=redir%3D%252F.auth%252Fcomplete',
                    'state=redir%3D%252Fapi%252Flogin-aad-complete',
                );

            const nonce = resStep2.setCookie[0];
            const staticWebAppsAuthContextCookie = resStep1.setCookie[0];
            const staticWebAppsAuthContextCookieModified =
                staticWebAppsAuthContextCookie.replace(
                    'domain=swa.azurestaticapps.net; ',
                    '',
                );

			/*
				original cookie is not set since Domain=..., so it shall be removed
				original -> 
					"StaticWebAppsAuthContextCookie=Cp38wzg...5ICYc13Q==; path=/; secure; HttpOnly; domain=swa.azurestaticapps.net; expires=Fri, 02 Jan 2026 13:14:07 GMT; SameSite=None"
				modified -> 
					"StaticWebAppsAuthContextCookie=Cp38wzg...5ICYc13Q==; path=/; secure; HttpOnly; expires=Fri, 02 Jan 2026 13:14:07 GMT; SameSite=None"
			*/

            const cookiesToSet = [
                staticWebAppsAuthContextCookieModified,
                nonce,
            ];

            client.res.writeHead(302, {
                Location: decodeURIComponent(location),
                'Set-Cookie': cookiesToSet,
            });
            client.res.end();

			/* 
            resFns.fn200.call(
            	{
            		contentType: contentTypes.json,
            		jsonBody: {
            			staticWebAppsAuthContextCookie: resStep1.setCookie,
            			nonce: resStep2.setCookie,
            			loginLocation: resStep2.location,
            		},
            	},
            	client,
            	urlObj,
            );
            jsonBody -> {
				staticWebAppsAuthContextCookie: [
					"StaticWebAppsAuthContextCookie=Cp38wzgLzRo/zRLguKfEmOcJz/OUbQO1DH9E9cC4l1S6F9CjGLkNhzk6XK1hQaxTzoyct1qc0TcT1cTuXaBdqx7nrbbgqNFwwyhPg1bBHfnR4ALedbXcTY2vT7aXIvWjm4bBPZ1R38CcvMdrYIMAuWu7HTmEYIK+nJveYTy54AR+SBZbvv3vOjICgbcDQeXvme8DanOfjOmciQpLgCEpGGN7+39UoDIMMDobG1nb6TNLU/HBaVaT2JR5zSKzxyQAL1PTTC++1wlDi071TCH4XR1729JB3uiB7JGWyV7iYmQA9RBeiGfdXfOpjkmaiBdYspBp4JHYQvwwLI58BetX2El2LoizfGtC54L2hdRF1/qc1rp8CnQGag0dJ3VxNDtVJwM6v4m5NAX4uUdh/7wtnGPFUdOiqfdNERXNWWNP7LcNeUWGYuNkKtEE9565ijiQelaSpslWQmXZ+15ICYc13Q==; path=/; secure; HttpOnly; domain=swa.azurestaticapps.net; expires=Fri, 02 Jan 2026 13:14:07 GMT; SameSite=None",
				],
				nonce: [
					"Nonce=DnTPlAhXemIXYMZCaA1EfcA70d+ayDVev6cIKF9bjOsNlNgwBxdSbynGUeAMDMpvbTh2+fPkS1Srvb4p7O4TIpODRZvC/WhvW0UytojdqGQqCMKitxrCR5oyKptgOVNj; path=/; secure; HttpOnly",
				],
				loginLocation:
					"https://login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/oauth2/v2.0/authorize?response_type=code+id_token&redirect_uri=https%3A%2F%2Fswa.azurestaticapps.net%2F.auth%2Flogin%2Faad%2Fcallback&client_id=6c3576f7-54c2-4322-8402-f7774963a1e1&scope=openid+profile+email&response_mode=form_post&resource=https%3A%2F%2Fgraph.microsoft.com&prompt=select_account&nonce=c7f096cdf8ae492fa6f3e8ab6102daa2_20260102131407&state=redir%3D%252F.auth%252Fcomplete",
			} */
        },
        '/api/login-aad-complete': async (client, urlObj) => {
            const cookiesArr = client.req.headers.cookie.split('; ');

			const values = [
                'StaticWebAppsAuthContextCookie=',
                'AppServiceAuthSession1=',
                'AppServiceAuthSession=',
            ];

            const cookiesToPass = values.reduce((acc, val) => {
                const cookie = cookiesArr.find((c) => c.startsWith(val));
                return cookie ? (acc.push(cookie), acc) : acc;
            }, []);

            const req = new DoProudGETRequest({
                href: 'https://swa.azurestaticapps.net/.auth/complete',
                cookie: cookiesToPass,
            });
            const res = await req.getData();

            const finalCookie = res.setCookie.map((c) =>
                c.replace('domain=swa.azurestaticapps.net; ', ''),
            );

            client.res.writeHead(302, {
                Location: '/login-aad-complete/',
                'Set-Cookie': [
                    'StaticWebAppsAuthContextCookie=deleted; path=/; Max-Age=0',
                    'Nonce=deleted; path=/; Max-Age=0',
                    ...finalCookie,
                ],
            });
            client.res.end();
        },
    },
};

const httpServer = http.createServer();

httpServer.on('request', (req, res) => {
    const baseURL = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
    const reqUrlObj = new URL(req.url, baseURL);
    const fn = routes[req.method]?.[reqUrlObj.pathname] ?? resFns.fn404;
    return fn({ req, res }, reqUrlObj);
});

httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
