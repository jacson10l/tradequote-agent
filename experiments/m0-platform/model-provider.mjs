// Only synthetic prompts are used by M0 connection verification. Never log headers/bodies.
export function createProvider({ key, baseURL='https://api.deepseek.com', timeoutMs=30000, transport=fetch }) {
  async function request(route,body,signal) {
    const bounded=AbortSignal.timeout(timeoutMs);
    try {
      const response=await transport(`${baseURL}${route}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:signal?AbortSignal.any([signal,bounded]):bounded,redirect:'error'});
      if(!response.ok) throw new Error(response.status===401?'MODEL_AUTH_FAILED':response.status===429?'MODEL_RATE_LIMITED':`MODEL_HTTP_${response.status}`);
      try {return await response.json();} catch {throw new Error('MODEL_INVALID_OUTPUT');}
    } catch(error) {
      if(signal?.aborted) throw new Error('CANCELLED');
      if(bounded.aborted) throw new Error('MODEL_TIMEOUT');
      if(/^MODEL_/.test(error.message)) throw error;
      throw new Error('MODEL_CONNECTION_FAILED');
    }
  }
  return {
    async models(signal) {const body=await request('/models',undefined,signal);if(!Array.isArray(body.data)||body.data.some(x=>typeof x.id!=='string'))throw new Error('MODEL_INVALID_OUTPUT');return body.data.map(x=>x.id);},
    async chat(model,messages,{tools,signal,json=false}={}) {
      const body=await request('/chat/completions',{model,messages,max_tokens:512,stream:false,...(tools?{tools}:{}),...(json?{response_format:{type:'json_object'}}:{})},signal);
      const message=body.choices?.[0]?.message;
      if(!message||(!message.content&&!message.tool_calls?.length)) throw new Error('MODEL_INVALID_OUTPUT');
      return message;
    },
  };
}
