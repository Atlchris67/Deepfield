import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanetDialog} from '../src/PlanetDialog';
import type {Star} from '../src/fleetSelection';
import '../src/style.css';
const fixtures:Record<string,Star>=await (await fetch('/planet-fixtures.json')).json();
function Fixture(){const [selected,setSelected]=useState<string|null>(null);return <main><h1>Planet statistics test</h1>{Object.keys(fixtures).map(name=><button key={name} onClick={()=>setSelected(name)}>Open {name}</button>)}{selected&&<PlanetDialog star={fixtures[selected]} turn={5} typed={selected!=='classic'} onClose={()=>setSelected(null)}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
