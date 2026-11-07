(()=>{
 const config=JSON.parse(document.getElementById('goc-player-config').textContent||'{}'),params=new URLSearchParams(location.search),id=String(config.id||params.get('id')||'');if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;
 const origin=config.origin||location.origin,iframe=document.getElementById('yt');let player,port;
 iframe.src='https://www.youtube-nocookie.com/embed/'+id+'?'+new URLSearchParams({playsinline:'1',controls:'1',rel:'0',autoplay:'0',fs:'0',enablejsapi:'1',origin});
 function emit(error){if(!player&&!error)return;try{const value={type:'goc:tick',id,time:Number(player?.getCurrentTime?.()||0),duration:Number(player?.getDuration?.()||0),state:Number(player?.getPlayerState?.()||-1)};if(error)value.error=String(error);if(port)port.postMessage(JSON.stringify(value));else if(window.webkit?.messageHandlers?.videoMetrics)window.webkit.messageHandlers.videoMetrics.postMessage(value);else if(parent!==window)parent.postMessage(value,location.origin)}catch{}}
 function command(value){if(!player)return;if(value.command==='pause')player.pauseVideo();if(value.command==='seek'&&Number.isFinite(value.time)&&value.time>=0&&value.time<86400)player.seekTo(value.time,true)}
 window.addEventListener('message',event=>{if((event.data==='goc:connect'||event.data?.type==='goc:connect')&&event.ports?.[0]){port=event.ports[0];port.onmessage=e=>{try{command(JSON.parse(e.data))}catch{}};emit()}else if(event.origin===location.origin&&event.source===parent&&event.data?.type==='goc:command')command(event.data)});
 window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('yt',{events:{onReady(){setInterval(()=>emit(),250);emit()},onStateChange(){emit()},onError(event){emit('YouTube '+event.data)}}})};
})();
