"""Real Chromium checks. Start Vite on 5192 and ChromeDriver on 9516 first.

Uses only Python's standard library. Writes 49 screenshots and report.json under
docs/s12-browser. Exercises fictional browser state; never starts live providers.
"""
import json, urllib.request, time, base64, pathlib
BASE='http://127.0.0.1:9516'
def request(method,path,data=None):
    req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'},method=method)
    try: value=json.load(urllib.request.urlopen(req,timeout=40))['value']
    except urllib.error.HTTPError as e: raise RuntimeError(e.read().decode())
    if isinstance(value,dict) and 'error' in value: raise RuntimeError(value)
    return value
session=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'chrome','goog:chromeOptions':{'binary':'/usr/bin/chromium','args':['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--window-size=1440,900'],'prefs':{'credentials_enable_service':False}},'goog:loggingPrefs':{'browser':'ALL','performance':'ALL'}}}})['sessionId']
path='/session/'+session
def js(code,*args): return request('POST',path+'/execute/sync',{'script':code,'args':list(args)})
def wait_for(code):
    for _ in range(100):
        if js('return Boolean('+code+')'): return
        time.sleep(.1)
    raise AssertionError('Timed out '+code+' '+str(js('return document.body.innerText'))[:700]+' LOGS '+str(request('POST',path+'/log',{'type':'browser'})))
def navigate(url):
    request('POST',path+'/url',{'url':url});wait_for('document.querySelector("main")');time.sleep(.2)
def click(selector):
    el=js('return document.querySelector(arguments[0])',selector)
    assert el,selector
    request('POST',path+'/element/'+el['element-6066-11e4-a52e-4f735466cecf']+'/click',{})
    time.sleep(.08)
def button(label):
    el=js('return [...document.querySelectorAll("button")].filter(e=>e.getClientRects().length).find(e=>e.textContent.trim()===arguments[0]) || [...document.querySelectorAll("button")].filter(e=>e.getClientRects().length).find(e=>e.textContent.includes(arguments[0]))',label)
    assert el,label
    request('POST',path+'/element/'+el['element-6066-11e4-a52e-4f735466cecf']+'/click',{});time.sleep(.1)
out=pathlib.Path('docs/s12-browser');out.mkdir(parents=True,exist_ok=True)
report=[]
def shot(name,selector=None):
    if selector: js('document.querySelector(arguments[0]).scrollIntoView({block:"start"})',selector)
    time.sleep(.15)
    metrics=js('return {viewport:[innerWidth,innerHeight],width:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth}')
    assert not metrics['overflow'],(name,metrics)
    (out/(name+'.png')).write_bytes(base64.b64decode(request('GET',path+'/screenshot')))
    report.append({'screen':name,**metrics})
try:
  home='http://127.0.0.1:5192/src/demo/harness.html?screen=opportunities'
  demo='http://127.0.0.1:5192/src/demo/harness.html'
  for width,height in [(1440,900),(1280,720),(390,844)]:
    request('POST',path+'/window/rect',{'width':width,'height':height})
    js("window.resizeTo(arguments[0],arguments[1])",width,height)
    navigate(home)
    js('localStorage.setItem("trajectoryos:theme","light")')
    js('localStorage.removeItem("trajectoryos:fictional-journey:v2")')
    navigate(home)
    # Chrome outer window bounds differ from viewport; CDP gives exact requested viewport.
    request('POST',path+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False}})
    shot(f'{width}-01-opportunities')
    click('a[href="/demo/journey?view=opportunity"]')
    wait_for('document.querySelector(".dj-job-connections")')
    navigate(home)
    click('a[href*="view=history"]')
    wait_for('document.querySelector("#engineering-history")')
    navigate(home)
    click('a[href="/demo/journey?view=mentor"]')
    wait_for('document.querySelector(".dj-mentor")')
    navigate(demo);js('localStorage.removeItem("trajectoryos:fictional-journey:v2")');navigate(demo)
    wait_for('document.querySelector(".dj-candidate")')
    shot(f'{width}-02-candidate-history','#engineering-history')
    button('View opportunity');shot(f'{width}-03-job')
    click('.dj-job-connections > details:nth-of-type(3) > summary');shot(f'{width}-04-requirement-connections','.dj-job-connections')
    button('Prepare application');shot(f'{width}-05-evidence')
    for aid in ['a-hld','a-lld','a-tests','a-reasoning']: click('#application-'+aid)
    button('Review application (4)');shot(f'{width}-06-preview')
    assert js('return [...document.querySelectorAll("button")].find(e=>e.textContent.includes("Submit demo application")).disabled')
    click('.dj-consent input');button('Submit demo application');shot(f'{width}-07-submitted','.dj-success')
    button('See what the employer receives');shot(f'{width}-08-employer-profile','.dj-profile-header')
    assert js('return !document.querySelector(".dj-candidate") && !document.querySelector(".dj-mentor")')
    shot(f'{width}-09-shared-timeline','.dj-shared-journey')
    click('.dj-shared-journey [data-history-type=observation] .dj-event-details > summary')
    click('.dj-shared-journey [data-history-type=observation] .dj-material > summary')
    failed=js('return [...document.querySelectorAll(".dj-shared-journey .dj-checks li")].find(e=>e.textContent.includes("T3"))')
    js('arguments[0].scrollIntoView({block:"center"})',failed);shot(f'{width}-10-concurrency-failure')
    button('Shortlist for technical conversation');shot(f'{width}-11-shortlist-dialog')
    # Native Escape must cancel without manufacturing a decision.
    request('POST',path+'/actions',{'actions':[{'type':'key','id':'keyboard','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
    assert js('return JSON.parse(localStorage.getItem("trajectoryos:fictional-journey:v2")).decisions.length===0')
    button('Shortlist for technical conversation');button('Confirm human demo shortlist');shot(f'{width}-12-shortlisted','.dj-decision')
    button('Mentor');shot(f'{width}-13-mentor-question')
    assert not js('return Boolean(document.querySelector(".dj-mentor-review"))')
    button('Concurrent retries')
    for aid in ['a-lld','a-failure']: click('#mentor-'+aid)
    button('Preview what the mentor sees');shot(f'{width}-14-mentor-consent')
    click('.dj-consent input');button('Request example review');shot(f'{width}-15-mentor-response','.dj-mentor-review')
    button('Candidate');shot(f'{width}-16-candidate-next-action','#engineering-history')
    assert js('return document.body.textContent.includes("Mentor example reviewed") && document.body.textContent.includes("Shortlisted in this demo.")')
    button('Employer')
    assert not js('return /Mentor example reviewed|two concurrent requests using the same key resolve|a-failure/.test(document.body.innerHTML)')
    request('POST',path+'/refresh',{});wait_for('document.querySelector(".dj-candidate")')
    assert js('return document.body.textContent.includes("Mentor example reviewed") && document.body.textContent.includes("Shortlisted in this demo.")')
    if width==1440:
      js('document.documentElement.dataset.theme="dark"');shot('1440-17-dark-history','#engineering-history');js('document.documentElement.dataset.theme="light"')
  logs=request('POST',path+'/log',{'type':'browser'})
  errors=[item for item in logs if item['level']=='SEVERE' and 'favicon' not in item['message']]
  network=request('POST',path+'/log',{'type':'performance'})
  api_requests=[]
  for entry in network:
    msg=json.loads(entry['message'])['message']
    if msg['method']=='Network.requestWillBeSent':
      url=msg['params']['request']['url']
      if '/api/v1/' in url: api_requests.append(url)
  assert not api_requests,api_requests
  report.append({'browserErrors':errors,'realApiRequests':api_requests,'checks':['exact viewport dimensions','no horizontal overflow','landing links through AppRoutes','mandatory application and mentor consent','selected-only employer DOM','native Escape cancels shortlist','manual shortlist confirmation','private next action','refresh persistence']})
  (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps({'screenshots':len(report)-1,'browserErrors':errors,'report':str(out/'report.json')}))
finally:
  request('DELETE',path)
