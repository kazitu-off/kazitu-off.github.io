let root,api,running,score,level;
function reset(){score=0;level=1;running=true;render();}
function click(){if(!running)return;score+=level;api?.playTone?.('click');if(score%25===0)level++;render();}
function render(){root.querySelector('#score').textContent=`Очки: ${Math.round(score)} · Сила клика: ${Math.round(level)}`;}
export function init(r,a={}){root=r;api=a;root.innerHTML='<h2>Кликер</h2><p id="score"></p><button id="tap" style="font-size:2rem">КЛИК!</button><br><button id="pause">Пауза</button> <button id="again">Заново</button>';root.querySelector('#tap').onclick=click;root.querySelector('#pause').onclick=()=>{running=!running;if(!running)api?.saveScore?.(score)};root.querySelector('#again').onclick=reset;reset();}export function start(){running=true}export function pause(){running=false;api?.saveScore?.(score)}export function destroy(){root.replaceChildren()}
