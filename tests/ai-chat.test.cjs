'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {extractText,handleAiChat} = require('../lib/ai-chat');

test('extracts Responses API output', () => {
  assert.equal(extractText({output:[{content:[{type:'output_text',text:'გამარჯობა!'}]}]}),'გამარჯობა!');
  assert.equal(extractText({output:[]}), '');
});
test('rejects non-POST and cross-site origins', async () => {
  let status;
  const deps={readBody:async()=>({message:'hello'}),json:(_res,s)=>{status=s;},originIsAllowed:()=>false};
  await handleAiChat({method:'GET',headers:{}},{},deps);
  assert.equal(status,405);
  await handleAiChat({method:'POST',headers:{origin:'https://other.example','content-type':'application/json'}},{},deps);
  assert.equal(status,403);
});
