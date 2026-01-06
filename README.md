# Problem

In Azure Static Web Apps (SWA) `login_hint` parameter is dropped and never passed to the `login.microsoftonline.com` endpoint.

This repo provides a quick-fix and enables `login_hint`.

## TL;DR

See **Fixed auth flow steps** at the bottom.

## References to the problem
- [learn.microsoft.com/en-us/answers/questions/2286706](https://learn.microsoft.com/en-us/answers/questions/2286706/azure-static-web-apps-pass-dynamic-parameters-to-a)
- [learn.microsoft.com/en-us/answers/questions/5658734](https://learn.microsoft.com/en-us/answers/questions/5658734/login-hint-and-logout-hint-do-not-work-with-azure)
- [github.com/Azure/static-web-apps/issues/15288](https://github.com/Azure/static-web-apps/issues/1528)
- [github.com/Azure/static-web-apps/discussions/1712](https://github.com/Azure/static-web-apps/discussions/1712)

# Tools
- Azure Static Web App [learn.microsoft.com/en-us/azure/static-web-apps](https://learn.microsoft.com/en-us/azure/static-web-apps/overview)
    - Settings -> Authentication -> Enabled `/.auth/login/aad` endpoint
    - Settings -> APIs -> linked backend type `Web App`
    - staticwebapp.config.json (only essential parts)
        ```json
        {
            "responseOverrides": {
                "401": {
                    "statusCode": 302,
                    "redirect": "/login/"
                }
            },
            "routes": [
                {
                    "route": "/login-aad-complete", /*
                        here we get some saved last user's session states 
                        in localStorage for home route to restore on load */
                    "rewrite": "/",
                    "allowedRoles": ["anonymous", "authenticated"]
                },
                {
                    "route": "/login",
                    "rewrite": "/aad-redirect/" /* 
                        here we check if 
                        1) login_hint is present in url and take this
                        2) login_hint is present in localStorage as last signed-in user and take this
                        and location.replace() with user as
                        a) '/api/login-aad?user=bing.whatman'), or
                        b)  '/api/login-aad?user=') that initiates user selection dialog */
                },
                {
                    "route": "/api/login*",
                    "allowedRoles": ["anonymous", "authenticated"]
                },
                {
                    "route": "/*",
                    "allowedRoles": ["authenticated"]
                }
            ],
            "navigationFallback": {
                "rewrite": "/index.html",
                "exclude": [
                    "*.{js,css,png,gif,jpg,jpeg,ico}",
                    "/api/*"
                ]
            },
            "auth": {
                "rolesSource": "/api/getroles",
                "identityProviders": {
                    "azureActiveDirectory": {
                        "registration": {
                            "openIdIssuer": "https://login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/v2.0/",
                            "clientIdSettingName": "CLIENT_ID",
                            "clientSecretSettingName": "CLIENT_SECRET"
                        },
                        "login": {
                            "loginParameters": [
                                "resource=https://graph.microsoft.com",
                                "prompt=select_account"
                            ]
                        }
                    }
                }
            }
        }
        ```
- Azure Web App in Node.js v24 [learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs?tabs=windows&pivots=development-environment-azure-portal)
- Azure Web App linked as API backend in SWA [learn.microsoft.com/en-us/azure/static-web-apps/apis-app-service](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-app-service#link-an-azure-app-service-web-app)

# Default auth flow in short

SWA uses [Easy Auth](https://github.com/cgillum/easyauth/wiki/Login) authentication flow.

## Steps
1. User navigates to SWA's URL `https://swa.azurestaticapps.net/.auth/login/aad?login_hint=bing.whatman@contoso.com`
2. Redirect to `https://swa.azurestaticapps.net/.auth/login/aad?post_login_redirect_uri=/.auth/complete&staticWebAppsAuthNonce=aTakZLY%2fCmXnnD%2foxHxXW%2fWDcXGAy27B84se3dzrpE7UcwEFqKGy2VNnXRqvPInletF6R26ZDfdMSD0kKda41Y8%2b3BXO%2bHUoG3VEbaJpSkhdQ%2fRFWgFb1nKNWZ80dtzW`
3. Redirect to `https://login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/oauth2/v2.0/authorize?response_type=code+id_token&redirect_uri=https%3A%2F%2Fswa.azurestaticapps.net%2F.auth%2Flogin%2Faad%2Fcallback&client_id=6c3476f8-54c2-4322-8401-f7774963a1e1&scope=openid+profile+email&prompt=select_account&response_mode=form_post&resource=https%3A%2F%2Fgraph.microsoft.com&nonce=9108b12ec87a4effa26bd5287d792605_20251223165427&state=redir%3D%252F.auth%252Fcomplete`

    As we see `login_hint` is not included in Step 3 which normally shall look like this:

    `https://login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/oauth2/v2.0/authorize?response_type=code+id_token&redirect_uri=https%3A%2F%2Fswa.azurestaticapps.net%2F.auth%2Flogin%2Faad%2Fcallback&client_id=6c3476f8-54c2-4322-8401-f7774963a1e1&scope=openid+profile+email&login_hint=bing.whatman%40contoso.com&response_mode=form_post&resource=https%3A%2F%2Fgraph.microsoft.com&nonce=9108b12ec87a4effa26bd5287d792605_20251223165427&state=redir%3D%252F.auth%252Fcomplete`

# Fix

- Implement a middleware on Node.js with built-in [http.createServer](https://nodejs.org/docs/latest-v24.x/api/http.html#httpcreateserveroptions-requestlistener) and [http2 connect](https://nodejs.org/docs/latest-v22.x/api/http2.html#clienthttp2sessionrequestheaders-options) request since the original EasyAuth flow uses pseudo-headers `:authority`, `:path` that are a part of the HTTP/2 protocol.

    - `http.createServer` is served as `https` by default by Azure 

- Add `login_hint` in the middle of the process by ammending the request url to the `login.microsoftonline.com` endpoint using right cookies obtained in the process.

- If process fails, fallback to normal auth flow redirecting to `/.auth/login/aad`

# Default auth flow in details

## STEP_1 
### Request
swa.azurestaticapps.net/.auth/login/aad

- :authority swa.azurestaticapps.net
- :method GET
- :path /.auth/login/aad
- :scheme https

### Response 302
- Location 
    - swa.azurestaticapps.net/.auth/login/aad?post_login_redirect_uri=/.auth/complete&staticWebAppsAuthNonce=TrdHVYBiTRmNLQoMBm7hJSiyYfX15loGBTayMnloMol5EE3hTzRywjh1sWJTWkf%2bkzB3Scoi14mtNflJKPyYapdjyRPL7SKroxPvViL6%2fjAW1T11wMdl9Fxc7u%2brhkbJ
- Set-Cookie 
    - StaticWebAppsAuthContextCookie=<StaticWebAppsAuthContextCookie_STEP_1>; path=/; secure; HttpOnly; domain=swa.azurestaticapps.net; expires=Thu, 01 Jan 2026 09:54:36 GMT; SameSite=None

## STEP_2
### Request
swa.azurestaticapps.net/.auth/login/aad?post_login_redirect_uri=/.auth/complete&staticWebAppsAuthNonce=TrdHVYBiTRmNLQoMBm7hJSiyYfX15loGBTayMnloMol5EE3hTzRywjh1sWJTWkf%2bkzB3Scoi14mtNflJKPyYapdjyRPL7SKroxPvViL6%2fjAW1T11wMdl9Fxc7u%2brhkbJ

- :authority swa.azurestaticapps.net
- :method GET
- :path <pathname+search>
- :scheme https
- Cookie StaticWebAppsAuthContextCookie=<StaticWebAppsAuthContextCookie_STEP_1>

### Response 302
- Location
    - login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/oauth2/v2.0/authorize?response_type=code+id_token&redirect_uri=https%3A%2F%2Fswa.azurestaticapps.net%2F.auth%2Flogin%2Faad%2Fcallback&client_id=6c3576f7-54c2-4322-8402-f7774963a1e1&scope=openid+profile+email&response_mode=form_post&resource=https%3A%2F%2Fgraph.microsoft.com&prompt=select_account&nonce=dd2180e9d7774cd4b786ed2d3e546271_20260101095436&state=redir%3D%252F.auth%252Fcomplete
- Set-Cookie 
    - Nonce=<nonce_STEP_2>; path=/; secure; HttpOnly; SameSite=None

## STEP_3
### Request
login.microsoftonline.com/c74da02d-281d-4a45-a4af-cc520eafa6e3/oauth2/v2.0/authorize?response_type=code+id_token&redirect_uri=https%3A%2F%2Fswa.azurestaticapps.net%2F.auth%2Flogin%2Faad%2Fcallback&client_id=6c3576f7-54c2-4322-8402-f7774963a1e1&scope=openid+profile+email&response_mode=form_post&resource=https%3A%2F%2Fgraph.microsoft.com&prompt=select_account&nonce=dd2180e9d7774cd4b786ed2d3e546271_20260101095436&state=redir%3D%252F.auth%252Fcomplete
- :authority login.microsoftonline.com
- :method GET
- :path <pathname+search>
- :scheme https
- Cookie ...

### Response 200
- Set-Cookie ...

## STEP_4 callback
### Request
swa.azurestaticapps.net/.auth/login/aad/callback
- :authority swa.azurestaticapps.net
- :method POST
- :path /.auth/login/aad/callback
- :scheme https
- content-type application/x-www-form-urlencoded
- Cookie 
    - StaticWebAppsAuthContextCookie=<StaticWebAppsAuthContextCookie_STEP_1>; Nonce=<nonce_STEP_2>
- Payload
    - code 1.ARMBHaBNx...
    - id_token eyJ0eXA...
    - state redir=%2F.auth%2Fcomplete
    - session_state 000f713a-29d6-51af-8aba-f0dc37fc8648

### Response 302
- Location 
    - swa.azurestaticapps.net/.auth/complete
- Set-Cookie 
    - Nonce=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT
- Set-Cookie 
    - RedirectCount=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT
- Set-Cookie 
    - AppServiceAuthSession=<AppServiceAuthSession_STEP_4>; path=/; secure; HttpOnly; expires=Thu, 01 Jan 2026 17:49:45 GMT; SameSite=None
- Set-Cookie 
    - AppServiceAuthSession1=<AppServiceAuthSession1_STEP_4>; path=/; secure; HttpOnly; expires=Thu, 01 Jan 2026 17:49:45 GMT; SameSite=None

## STEP_5
### Request 
swa.azurestaticapps.net/.auth/complete
- :authority swa.azurestaticapps.net
- :method POST
- :path /.auth/complete
- :scheme https
- content-type application/x-www-form-urlencoded
- Cookie
    - StaticWebAppsAuthContextCookie=<from STEP_1>;
    - AppServiceAuthSession=<AppServiceAuthSession_STEP_4>;
    - AppServiceAuthSession1=<AppServiceAuthSession1_STEP_4>

### Response 200
- Set-Cookie
    - StaticWebAppsAuthContextCookie=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=swa.azurestaticapps.net
- Set-Cookie 
    - StaticWebAppsAuthCookie=z3ggJagRBskW1jbcUckx3ULDTtXOEgnZHMqXoqzUZqFkF+uZihIRDjrdWJRg0UMCmW/bhSHus4NPjcOY/Kw0TjPTCjKb7St1wjRBy+NGljEIv9J3fI9oy//t9oNuSO4orpQ744Lm83jXZmpHh/YZji30Bw7816OE93rbgwAJlSeVeg3rqTg/09MVYXn4TAFWmBDfMbsWtu0jHScQNCd1NopR4B28SjhlbyuJ8zlRZW+YQ0Fla1MDjZfcmEi1yFMcGz89DvTFmZSFhs3eTYvNUTtyyrHE9AbKnSAxlr4cB1dQ9g6kPy9O/qrOjMplyFHKpupSaVa97l4/EmyISXzLOg==; path=/; secure; HttpOnly; domain=swa.azurestaticapps.net; expires=Thu, 01 Jan 2026 17:49:47 GMT; SameSite=Strict


# Fixed auth flow steps

- Client navigates to `https://swa.azurestaticapps.net`
- If active session is not present (EasyAuth defaults to 8 hours), client redirects to `/login/` as set in `staticwebapp.config.json`
-  client redirects to `/aad-redirect/` to get `login_hint` either from `location.search` or from `localStorage` and redirects to `/api/login-aad?user=bing.whatman`
- backend picks up route `/api/login-aad` and get `?user` from `urlObj.searchParams`
- if user is not present, redirect to default EasyAuth route `https://swa.azurestaticapps.net/.auth/login/aad`, else
- send http2 request to `https://swa.azurestaticapps.net/.auth/login/aad` and get redirect URI (location) and StaticWebAppsAuthContextCookie cookie.
- send http2 request to the recieved location `https://swa.azurestaticapps.net/.auth/login/aad?post_login_redirect_uri=/.auth/complete&staticWebAppsAuthNonce=TrdHVY...bJ` with cookie StaticWebAppsAuthContextCookie and get URL to `login.microsoftonline.com` as location and nonce cookie
- in the received location replace `prompt=select_account` with `login_hint=bing.whatman@contoso.com` and `state=redir%3D%252F.auth%252Fcomplete` with `state=redir%3D%252Fapi%252Flogin-aad-complete`
- modify StaticWebAppsAuthContextCookie by replacing `domain=swa.azurestaticapps.net; ` with `<empty string>`
    - NB!!! since backend has another URL than SWA, this cookie will not be set by the browser if this domain is present
- redirect back to the browser with modified staticWebAppsAuthContextCookieModified and nonce and modified location
- broswer sets StaticWebAppsAuthContextCookie and Nonce and redirects to `login.microsoftonline.com` with `login_hint`
- upon auth completion the browser redirects to backend route `/api/login-aad-complete`
- backend get cookies StaticWebAppsAuthContextCookie, AppServiceAuthSession1, AppServiceAuthSession and sends these with http2 request to `https://swa.azurestaticapps.net/.auth/complete` receiving back StaticWebAppsAuthCookie
- backend redirects back to the SWA's url `/login-aad-complete/` setting StaticWebAppsAuthCookie cookie and deleting Nonce and StaticWebAppsAuthContextCookie
- `/login-aad-complete/` redirects to `/` as per `staticwebapp.config.json`


