// Minimal bounded tool loop; the host owns handlers and stable operation IDs.
// Full product run/event persistence is an M1/M4 responsibility, not implemented here.
export async function execute({provider,model,messages,tools,handlers,signal,maxTurns=6,operationId}) {
  const history=structuredClone(messages),calls=[];
  for(let turn=0;turn<maxTurns;turn++) {
    if(signal?.aborted) throw new Error('CANCELLED');
    const message=await provider.chat(model,history,{tools,signal});
    history.push(message);
    if(!message.tool_calls?.length) return {text:message.content,calls};
    for(const call of message.tool_calls) {
      if(signal?.aborted) throw new Error('CANCELLED');
      const handler=handlers[call.function.name];
      if(!Object.hasOwn(handlers,call.function.name)) throw new Error('TOOL_NOT_ALLOWED');
      let args;try{args=JSON.parse(call.function.arguments)}catch{throw new Error('MODEL_INVALID_OUTPUT')}
      const result=await handler(args,{operationId,signal});
      calls.push(call.function.name);
      history.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    }
  }
  throw new Error('TOOL_BUDGET_EXCEEDED');
}
