import {isIP} from 'node:net';

// Render routes requests through Cloudflare. Do not trust the leftmost
// X-Forwarded-For entry: callers may supply their own value.
// CF-Connecting-IP is provided by the trusted edge; locally, use the socket.
export function clientAddress(req,renderHosted=process.env.RENDER==='true'){
 const socket=typeof req?.socket?.remoteAddress==='string'?req.socket.remoteAddress:'unknown';
 if(!renderHosted)return socket;
 const raw=req?.headers?.['cf-connecting-ip'];
 if(typeof raw==='string'&&isIP(raw.trim()))return raw.trim();
 return socket;
}
