const params = new URLSearchParams(window.location.search);
history.replaceState(null,'',window.location.pathname);
if(window.opener){
  window.opener.postMessage({type:'fin-vision-connect',state:params.get('state'),code:params.get('code'),error:params.get('error')},window.location.origin);
  document.getElementById('connectionMessage').textContent = 'Return to your planner. This window will close when verification finishes.';
} else {
  document.getElementById('connectionMessage').textContent = 'Open your planner and choose Connect Google to continue.';
}
