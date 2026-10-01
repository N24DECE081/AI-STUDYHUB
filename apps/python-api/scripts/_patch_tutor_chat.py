from pathlib import Path

path = Path(__file__).resolve().parents[1] / "server.py"
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "preference_intent=tutor_memory.chat_preference" in line)
end = next(i for i, line in enumerate(lines) if "if path=='/api/ai-tutor/assessment/start':" in line)
replacement = r'''   preference_intent=tutor_memory.chat_preference(message)
   if preference_intent:
    context,sources,query_keywords,agent_trace='',[],[],[{'tool':'preference_router','status':'handled'}]
   else:
    try:
     context,sources,query_keywords=tutor_context(u['id'],file_ids,message,fallback=mode in ('summarize','generate_quiz'))
    except LookupError:
     return self.json({'error':'Tài liệu không tồn tại hoặc không thuộc tài khoản này'},404)
   try:
    with db() as c:
     if mode=='generate_quiz':
      require_feature(c,u['id'],'quiz_from_chat')
     tutor_reservation=reserve_quota(c,u['id'],'tutor_chat',tutor_fingerprint({'message':message,'mode':mode,'depth':depth,'file_ids':file_ids,'model':requested_model}),request_key_from(self,x))
   except EntitlementError as error:
    return entitlement_http(self,error)
   if tutor_reservation.replay:
    return self.json(tutor_reservation.replay,200)
   try:
    if not preference_intent:
     context,tool_sources,agent_trace=tutor_agent.run(message,context)
     sources.extend(tool_sources)
    engine=get_engine()
    retrieval_tier='conversation' if preference_intent else ('documents' if context else 'miss')
    cached_knowledge=None
    if not context and not preference_intent:
     cached_knowledge=external_cache_lookup(message,query_keywords)
     if cached_knowledge:
      context=f"Bộ nhớ kiến thức bên ngoài: {cached_knowledge['answer']}"
      sources=[{'id':cached_knowledge['id'],'title':'Kho kiến thức bên ngoài','type':'external_cache'}]
      retrieval_tier='external_cache'
    with db() as c:
     conversation=tutor_store.conversation_for(c,u['id'],conversation_key,mode=mode,title=message[:60])
     conversation_id=int(conversation['id']); conversation_title=str(conversation['title'] or '')
     history=tutor_store.history(c,conversation_id,8)
     memory_profile=tutor_memory.profile(c,u['id'])
     profile_summary=str(memory_profile.get('summary') or '')
     if 'Chưa đủ dữ liệu' in profile_summary:
      profile_summary=''
    quiz=None; quiz_topic=''
    if mode=='generate_quiz':
     quiz,quiz_topic=chat_quiz(engine,message,context)
    if preference_intent:
     answer=preference_intent['reply']
    elif quiz:
     answer=(f'## Quiz nhanh: {quiz_topic}\n\n'
             f'{len(quiz["questions"])} câu hỏi bám theo tài liệu. Chọn đáp án rồi bấm **Kiểm tra** để xem kết quả.')
    elif retrieval_tier=='miss' and not getattr(engine,'uses_model',False):
     answer=('## Chưa tìm thấy kiến thức phù hợp\n\n'
             'Nova đã lọc từ khóa chính, kiểm tra tài liệu của bạn và tra kho kiến thức bên ngoài '
             'nhưng chưa có kết quả. Hãy bổ sung tài liệu liên quan hoặc cấu hình AI provider để '
             'Nova tìm hiểu và lưu câu trả lời vào cache cho lần sau.')
    else:
     answer=engine.answer(mode=mode,question=message,context=context,history=history,
                          learner_profile=profile_summary,depth=depth,model=model_override)
   except TutorEngineError as error:
    with db() as c:
     release_quota(c,tutor_reservation.id)
    return self.json({'error':f'AI Tutor tạm thời không trả lời được: {error}','retryable':True},502)
   except Exception:
    with db() as c:
     release_quota(c,tutor_reservation.id)
    raise
   health=tutor_engine.PROVIDER_HEALTH
   if retrieval_tier=='miss' and getattr(engine,'uses_model',False) and health.get('ok',True):
    provider=tutor_config.engine_status().get('provider') or 'external-ai'
    cache_id=external_cache_store(message,answer,query_keywords,provider)
    retrieval_tier='external_provider'
    sources=[{'id':cache_id,'title':f'Kiến thức chung · {provider}','type':'external_provider'}]
   elif retrieval_tier=='external_cache' and not quiz:
    answer=(f'## Kiến thức ngoài tài liệu\n\n{answer}\n\n'
            '> Nguồn: kho kiến thức bên ngoài đã lưu, do tài liệu của bạn không có nội dung phù hợp.')
   degraded=bool(getattr(engine,'name','')=='provider-resilient' and not health.get('ok',True))
   with db() as c:
    if not tutor_store.conversation_owned(c,conversation_id,u['id']):
     release_quota(c,tutor_reservation.id)
     return self.json({'conversation_id':conversation_key,'role':'assistant','content':'',
       'discarded':True,'reason':'conversation_deleted'},200)
    tutor_store.add_message(c,conversation_id,'user',message,mode)
    message_id=tutor_store.add_message(c,conversation_id,'assistant',answer,mode,payload=quiz)
    tutor_memory.observe_question(c,u['id'],message)
    tutor_memory.consolidate(c,u['id'])
    for source in sources:
     if source.get('type')=='document':
      advance_document_progress(c,u['id'],source.get('id'),60)
    if conversation_title in ('','Cuộc hội thoại mới'):
     tutor_store.rename_conversation(c,conversation_id,message[:60])
    provider_engine=getattr(engine,'primary',None)
    model_used=getattr(provider_engine,'last_model',None)
    failovers=getattr(provider_engine,'last_failovers',[])
    tutor_body={'conversation_id':conversation_key,'message_id':str(message_id),'role':'assistant','content':answer,'sources':sources,'mode':mode,'depth':depth,
     'model_requested':requested_model,'model_used':model_used,'model_failovers':failovers,
     'quiz':quiz,
     'retrieval':{'tier':retrieval_tier,'keywords':query_keywords},
     'agent_trace':agent_trace,
     'engine_degraded':degraded,'engine_degraded_reason':health.get('reason','') if degraded else ''}
    finalize_quota(c,tutor_reservation.id,tutor_body)
   return self.json(tutor_body,200)
'''.splitlines()
lines[start:end] = replacement
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"replaced {start+1}-{end} with {len(replacement)} lines")
