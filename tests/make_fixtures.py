import json,zipfile,pathlib,base64
root=pathlib.Path(__file__).parent/'fixtures';root.mkdir(exist_ok=True)
t='2026-11-17T00:00:00Z';sid='e18fe96e-57e1-4ebd-9aa4-1fcdecc434c3';fid='ba3701ca-6731-4c74-a648-a321989c3c5a'
image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhO0AAAAASUVORK5CYII=')
imgpath=f'chat_sessions/{sid}_files/{fid}_sample.png'
def msg(i,parent,role,text):return dict(id=i,parent_id=parent,role=role,status='FINISHED',thinking_enabled=False,search_enabled=False,accumulated_token_usage=10,inserted_at=t,fragments=[dict(type='REQUEST' if role=='USER' else 'RESPONSE',content=text)])
messages=[msg(1,None,'USER','这是从 DeepSeek 官方 ZIP 格式恢复的问题。'),msg(2,1,'ASSISTANT','历史回答，分支一。'),msg(3,1,'ASSISTANT','历史回答，当前分支二。')]
messages[0]['fragments'].append(dict(type='FILE',files=[dict(id=fid,file_name='sample.png',file_size=len(image),token_usage=None,inserted_at=t,export_path=imgpath,is_image=True,width=1,height=1)]))
session=dict(id=sid,title='官方 ZIP 导入测试',pinned=False,current_message_id=3,inserted_at=t,updated_at=t,messages=messages)
index=[dict(id=sid,title=session['title'],pinned=False,message_count=3,inserted_at=t,updated_at=t)]
for name,version,corrupt in [('official-format-v3.zip',3,False),('unsupported-version.zip',2,False),('invalid-index.zip',3,True)]:
 with zipfile.ZipFile(root/name,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('manifest.json',json.dumps(dict(export_format_version=version)))
  z.writestr('user.json','{}')
  z.writestr(f'chat_sessions/{sid}.json',json.dumps(session,ensure_ascii=False))
  z.writestr('chat_session_index.json',json.dumps([] if corrupt else index,ensure_ascii=False))
  z.writestr(imgpath,image)
(root/'truncated.zip').write_bytes((root/'official-format-v3.zip').read_bytes()[:160])
