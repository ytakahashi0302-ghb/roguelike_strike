import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GamePhase } from './CoreEngine';
import { Player, PlayerType, UltimateType } from './Entities';

const App: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<GameEngine | null>(null);
    const [phase, setPhase] = useState<GamePhase>('StartScreen');
    const [stage, setStage] = useState(1);
    const [turn, setTurn] = useState(1);
    const [coins, setCoins] = useState(0); // Coins earned in current run
    const [ultimate, setUltimate] = useState<UltimateType>('Nuke');

    // Persistent State
    const [persistentCoins, setPersistentCoins] = useState(0);
    const [upgrades, setUpgrades] = useState({ shield: false, damage: 0, capacity: 1 });

    useEffect(() => {
        // Load persist data
        const savedCoins = localStorage.getItem('rs_coins');
        const savedUpgrades = localStorage.getItem('rs_upgrades');
        if (savedCoins) setPersistentCoins(parseInt(savedCoins, 10));
        if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
    }, []);

    const saveProgress = (newCoins: number, newUpgrades: any) => {
        setPersistentCoins(newCoins);
        setUpgrades(newUpgrades);
        localStorage.setItem('rs_coins', newCoins.toString());
        localStorage.setItem('rs_upgrades', JSON.stringify(newUpgrades));
    };

    useEffect(() => {
        if (!canvasRef.current || engineRef.current) return;

        const engine = new GameEngine(canvasRef.current);
        engine.onStateChange = () => {
            setPhase(engine.currentPhase);
            setStage(engine.currentStage);
            setTurn(engine.turn);
            setCoins(engine.totalCoins);

            if (engine.currentPhase === 'GameOver') {
                setPersistentCoins(prev => {
                    const newTotal = prev + engine.totalCoins;
                    localStorage.setItem('rs_coins', newTotal.toString());
                    return newTotal;
                });
            }
        };
        engine.startLoop();
        engineRef.current = engine;

        return () => {
            engine.destroy();
            engineRef.current = null;
        };
    }, []);

    const handleStart = () => {
        if (engineRef.current) {
            engineRef.current.bonusDamage = upgrades.damage;
            engineRef.current.initialShield = upgrades.shield;
            engineRef.current.baseCapacity = upgrades.capacity;
            engineRef.current.initRun(ultimate);
        }
    };

    const handleStageSelect = (_type: 'normal' | 'elite' | 'boss') => {
        // type is ignored for now in Alpha
        engineRef.current?.startStage();
    };

    const handleRewardSelect = (type: PlayerType) => {
        if (engineRef.current) {
            const { team, canvas, bonusDamage } = engineRef.current;
            const newPlayer = new Player(canvas.width / 2, engineRef.current.playAreaHeight - 40, type);
            newPlayer.damage += bonusDamage;
            if (team.length < 4) {
                team.push(newPlayer);
            } else {
                team[team.length - 1] = newPlayer;
            }
            engineRef.current.currentStage++;
            engineRef.current.setPhase('StageSelect');
        }
    };

    return (
        <div id="app" style={{ position: 'relative', width: 400, height: 600, margin: '0 auto', overflow: 'hidden' }}>
            <canvas ref={canvasRef} width="400" height="600" style={{ display: 'block' }}></canvas>

            {/* UI Layer */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: phase === 'Playing' ? 'none' : 'auto', color: 'white', backgroundColor: phase !== 'Playing' ? 'rgba(0,0,0,0.8)' : 'transparent', display: phase === 'Playing' ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                {phase === 'StartScreen' && (
                    <div style={{ textAlign: 'center' }}>
                        <h1>ローグライク ストライク Alpha</h1>
                        <p>引っ張って狙い、離してストライク！</p>
                        <h3 style={{ color: '#f1c40f' }}>所持コイン: {persistentCoins}</h3>

                        <div style={{ margin: '15px 0' }}>
                            <label style={{ marginRight: 10, fontSize: 16 }}>必殺技:</label>
                            <select value={ultimate} onChange={e => setUltimate(e.target.value as UltimateType)} style={{ padding: '8px', fontSize: 16, borderRadius: 5 }}>
                                <option value="Nuke">大爆発 (全体ダメージ)</option>
                                <option value="DoubleDamage">火力バフ (1ターン2倍)</option>
                                <option value="Heal">防壁＆後退 (シールド復活)</option>
                            </select>
                        </div>

                        <div style={{ marginTop: 20, display: 'flex', gap: 15, justifyContent: 'center' }}>
                            <button onClick={handleStart} style={{ padding: '15px 30px', fontSize: 18, cursor: 'pointer', background: '#3498db', color: 'white', border: 'none', borderRadius: 5 }}>ゲームスタート</button>
                            <button onClick={() => engineRef.current?.setPhase('SkillTree')} style={{ padding: '15px 30px', fontSize: 18, cursor: 'pointer', background: '#9b59b6', color: 'white', border: 'none', borderRadius: 5 }}>アップグレード</button>
                        </div>
                    </div>
                )}

                {phase === 'SkillTree' && (
                    <div style={{ textAlign: 'center', width: '80%' }}>
                        <h2>スキルツリー</h2>
                        <h3 style={{ color: '#f1c40f' }}>利用可能: {persistentCoins} コイン</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginTop: 20 }}>
                            <div style={{ padding: 10, border: '1px solid #777', borderRadius: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4>初期シールド (50 コイン)</h4>
                                    <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>1回のランにつき1度だけ防衛ライン突破を防ぐ</p>
                                </div>
                                <button disabled={upgrades.shield || persistentCoins < 50} onClick={() => saveProgress(persistentCoins - 50, { ...upgrades, shield: true })} style={{ padding: '8px 15px', cursor: upgrades.shield ? 'default' : 'pointer' }}>
                                    {upgrades.shield ? '購入済み' : '購入'}
                                </button>
                            </div>

                            <div style={{ padding: 10, border: '1px solid #777', borderRadius: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4>攻撃力アップ (100 コイン)</h4>
                                    <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>全キャラクターの基礎攻撃力 +1</p>
                                </div>
                                <button disabled={upgrades.damage >= 1 || persistentCoins < 100} onClick={() => saveProgress(persistentCoins - 100, { ...upgrades, damage: 1 })} style={{ padding: '8px 15px', cursor: upgrades.damage >= 1 ? 'default' : 'pointer' }}>
                                    {upgrades.damage >= 1 ? '購入済み' : '購入'}
                                </button>
                            </div>

                            <div style={{ padding: 10, border: '1px solid #777', borderRadius: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4>編成枠拡張 (150 コイン)</h4>
                                    <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>初期メンバーが1体から2体に増加</p>
                                </div>
                                <button disabled={upgrades.capacity >= 2 || persistentCoins < 150} onClick={() => saveProgress(persistentCoins - 150, { ...upgrades, capacity: 2 })} style={{ padding: '8px 15px', cursor: upgrades.capacity >= 2 ? 'default' : 'pointer' }}>
                                    {upgrades.capacity >= 2 ? '購入済み' : '購入'}
                                </button>
                            </div>
                        </div>

                        <button onClick={() => engineRef.current?.setPhase('StartScreen')} style={{ marginTop: 30, padding: '10px 20px', cursor: 'pointer' }}>タイトルへ戻る</button>
                    </div>
                )}

                {phase === 'StageSelect' && (
                    <div style={{ textAlign: 'center' }}>
                        <h2>次のステージを選択</h2>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {stage === 5 ? (
                                <button onClick={() => handleStageSelect('boss')} style={{ padding: '20px', cursor: 'pointer', background: '#e74c3c', color: '#fff' }}>
                                    <h3>ボスステージ ☠️</h3>
                                    <p>強敵との決戦！</p>
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => handleStageSelect('normal')} style={{ padding: '20px', cursor: 'pointer', background: '#34495e', color: '#fff' }}>
                                        <h3>通常ステージ</h3>
                                        <p>標準的な敵が出現</p>
                                    </button>
                                    <button onClick={() => handleStageSelect('elite')} style={{ padding: '20px', cursor: 'pointer', background: '#f39c12', color: '#fff' }}>
                                        <h3>エリートステージ</h3>
                                        <p>強力な敵が出現</p>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {phase === 'RewardSelect' && (
                    <div style={{ textAlign: 'center' }}>
                        <h2>ステージクリア！</h2>
                        <p>新しい仲間を選択してください：</p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            {['Bounce', 'Pierce', 'Blast'].map(t => (
                                <button key={t} onClick={() => handleRewardSelect(t as any)} style={{ padding: '10px', cursor: 'pointer', background: '#2ecc71', color: '#fff', border: 'none', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <img src={`/assets/images/player_${t.toLowerCase()}.png`} width={48} height={48} alt={t} style={{ marginBottom: 5 }} />
                                    <span>{t}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {phase === 'GameOver' && (
                    <div style={{ textAlign: 'center' }}>
                        <h2>ゲームオーバー</h2>
                        <p>到達ステージ: {stage} - 生存ターン: {turn}</p>
                        <p style={{ color: '#2ecc71', fontWeight: 'bold' }}>+ 今回獲得したコイン: {coins}</p>
                        <button onClick={() => { setCoins(0); engineRef.current?.setPhase('StartScreen'); }} style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer', marginTop: 20 }}>タイトルへ戻る</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
