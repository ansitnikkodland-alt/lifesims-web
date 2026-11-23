import test from 'node:test';
import assert from 'node:assert/strict';
import {clientAddress} from '../client-ip.mjs';

const req=(address,headers={})=>({socket:{remoteAddress:address},headers});
test('Render uses the trusted edge address instead of the shared proxy socket',()=>{
 const proxy='10.0.0.18';
 assert.equal(clientAddress(req(proxy,{'cf-connecting-ip':'198.51.100.10'}),true),'198.51.100.10');
 assert.equal(clientAddress(req(proxy,{'cf-connecting-ip':'198.51.100.11'}),true),'198.51.100.11');
});
test('spoofed X-Forwarded-For never controls rate-limit identity',()=>{
 const client=req('10.0.0.18',{'x-forwarded-for':'203.0.113.200, 10.0.0.19',
  'cf-connecting-ip':'198.51.100.20'});
 assert.equal(clientAddress(client,true),'198.51.100.20');
});
test('invalid edge headers are ignored rather than trusted',()=>{
 assert.equal(clientAddress(req('10.0.0.1',{'cf-connecting-ip':'not-an-ip',
  'x-forwarded-for':'192.0.2.10'}),true),'10.0.0.1');
 assert.equal(clientAddress(req('10.0.0.1',{'cf-connecting-ip':'192.0.2.2, 192.0.2.3'}),true),'10.0.0.1');
});
test('local development ignores forwarded headers',()=>{
 assert.equal(clientAddress(req('127.0.0.1',{'cf-connecting-ip':'198.51.100.20',
  'x-forwarded-for':'203.0.113.8'}),false),'127.0.0.1');
});
test('ipv6 edge addresses are supported',()=>{
 assert.equal(clientAddress(req('::1',{'cf-connecting-ip':'2001:db8::7'}),true),'2001:db8::7');
});
