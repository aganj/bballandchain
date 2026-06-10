'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link2, Trophy, RotateCcw, Share, AlertTriangle, Loader2, Link as LinkIcon } from "lucide-react";

type GameData = {
  players: Record<string, string>;
  network: Record<string, string[]>;
};

export default function Game() {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [correctTeammateId, setCorrectTeammateId] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [visitedPlayers, setVisitedPlayers] = useState<string[]>([]);
  
  const [timeLeft, setTimeLeft] = useState(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`/active_nba_game_data.json?t=${new Date().getTime()}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Status ${res.status}: File not found`);
        return res.json();
      })
      .then(data => setGameData(data))
      .catch(err => {
        console.error("Failed to load data", err);
        setFetchError(err.message);
      });
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0) {
            handleGameOver();
            return 0;
          }
          return prev - 1;
        });
      }, 100);
    }
    return () => clearInterval(timerRef.current as NodeJS.Timeout);
  }, [gameState]);

  const startGame = () => {
    if (!gameData) return;
    setStreak(0);
    setVisitedPlayers([]);
    
    const playerIds = Object.keys(gameData.network);
    let startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    while (gameData.network[startId].length === 0) {
      startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    }
    
    setCurrentId(startId);
    setVisitedPlayers([startId]);
    generateRound(startId, [startId]);
    setGameState('playing');
  };

  const generateRound = (playerId: string, currentVisited: string[]) => {
    if (!gameData) return;
    
    const teammates = gameData.network[playerId];
    let validTeammates = teammates.filter(id => !currentVisited.includes(id));

    if (currentVisited.length > 1) {
      const previousId = currentVisited[currentVisited.length - 2];
      const previousTeammates = gameData.network[previousId];
      const jumpingTeammates = validTeammates.filter(id => !previousTeammates.includes(id));
      if (jumpingTeammates.length > 0) validTeammates = jumpingTeammates;
    }

    if (validTeammates.length === 0) {
      handleGameOver();
      return;
    }

    const correct = validTeammates[Math.floor(Math.random() * validTeammates.length)];
    setCorrectTeammateId(correct);

    const allPlayerIds = Object.keys(gameData.players);
    let decoys: string[] = [];
    while (decoys.length < 1) {
      let randomId = allPlayerIds[Math.floor(Math.random() * allPlayerIds.length)];
      if (randomId !== playerId && !teammates.includes(randomId) && !decoys.includes(randomId)) {
        decoys.push(randomId);
      }
    }

    const roundChoices = [correct, ...decoys].sort(() => Math.random() - 0.5);
    setChoices(roundChoices);
    setTimeLeft(100);
  };

  const handleGuess = (id: string) => {
    if (id === correctTeammateId) {
      const newStreak = streak + 1;
      const newVisited = [...visitedPlayers, id];
      setStreak(newStreak);
      setCurrentId(id);
      setVisitedPlayers(newVisited);
      generateRound(id, newVisited);
    } else {
      handleGameOver();
    }
  };

  const handleGameOver = () => {
    setGameState('gameover');
    clearInterval(timerRef.current as NodeJS.Timeout);
  };

  const handleShare = async () => {
    const shareText = `🔗 BBall and Chain: I linked ${streak} NBA players! Can you beat my streak?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'BBall and Chain', text: shareText });
        return;
      } catch (err) { console.log("Share cancelled.", err); }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareText);
      alert('Copied to clipboard!');
      return;
    }
    alert('Clipboard access blocked. Copy this text: ' + shareText);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://cdn.nba.com/headshots/nba/latest/260x190/fallback.png";
  };

  if (fetchError) return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-6 text-center overflow-hidden">
      <Card className="max-w-md w-full border-red-900/50 bg-red-950/20 shadow-xl backdrop-blur-sm">
        <CardHeader>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
          <CardTitle className="text-xl text-zinc-100">Data Connection Lost</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400 text-sm font-mono bg-black/50 p-3 rounded-md">{fetchError}</p>
        </CardContent>
      </Card>
    </div>
  );

  if (!gameData) return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
      <p className="text-zinc-500 font-bold tracking-widest uppercase text-sm animate-pulse">Initializing Roster...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col items-center p-3 sm:p-6 font-sans selection:bg-blue-500/30">
      
      <header className="w-full max-w-xl flex justify-between items-center mb-4 flex-shrink-0 z-10 relative">
        <div className="flex items-center gap-2 text-zinc-100">
          <Link2 className="w-6 h-6 text-blue-500" />
          <span className="font-black text-xl md:text-2xl tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">BBall and Chain</span>
        </div>
        {gameState === 'playing' && (
          <div className="flex items-center bg-[#0a0a0a] border border-zinc-800 rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <span className="text-[10px] sm:text-xs font-bold text-zinc-500 uppercase tracking-widest mr-2 sm:mr-3 mt-0.5">Streak</span>
            <span className="font-black text-lg sm:text-xl text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]">{streak}</span>
          </div>
        )}
      </header>

      <div className="w-full max-w-xl flex-1 flex flex-col relative overflow-hidden">

        {gameState === 'start' && (
          <div className="flex flex-col items-center justify-center h-full w-full animate-in fade-in zoom-in duration-500 pb-10">
            <div className="relative w-full">
              {/* Abstract glowing background behind the card */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>
              
              <Card className="w-full border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                {/* Tech grid overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                
                <CardHeader className="text-center pt-12 pb-6 relative z-10">
                  <div className="mx-auto bg-gradient-to-br from-blue-600 to-blue-800 w-24 h-24 sm:w-28 sm:h-28 rounded-[2rem] flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(37,99,235,0.4)] rotate-3 border border-blue-400/20">
                    <Link2 className="w-12 h-12 sm:w-14 sm:h-14 text-white -rotate-3" />
                  </div>
                  <CardTitle className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 tracking-tight leading-[1.1]">
                    The Ultimate<br/>Teammate Trivia
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center pb-12 px-6 md:px-10 relative z-10">
                  <p className="text-zinc-400 text-sm sm:text-base leading-relaxed mb-10 max-w-sm mx-auto">
                    Connect active NBA players who have shared a roster. One wrong link or an expired shot clock ends your streak.
                  </p>
                  <Button size="lg" className="w-full max-w-sm mx-auto bg-blue-600 hover:bg-blue-500 text-white text-lg sm:text-xl h-14 sm:h-16 font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] rounded-xl" onClick={startGame}>
                    Start New Chain
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {gameState === 'playing' && currentId && (
          <div className="flex flex-col flex-1 h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            {/* Authentic Hardware Shot Clock (Scaled Down) */}
            <div className="flex flex-col items-center justify-center w-full flex-shrink-0 mt-2 mb-2">
              <div className="bg-[#0a0000] border-[4px] sm:border-[6px] border-zinc-900 rounded-md px-5 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_0_15px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
                {/* Angled Glass Reflection */}
                <div className="absolute top-0 left-0 w-full h-[45%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
                {/* Subtle internal red reflection */}
                <div className="absolute inset-0 bg-red-500/5 pointer-events-none"></div>
                
                <div className="w-full text-center flex items-center justify-center mt-1">
                  <span 
                    className={`font-mono font-black text-4xl sm:text-5xl tabular-nums leading-none tracking-tighter text-[#ff1111] relative z-10 ${timeLeft < 30 ? 'animate-pulse' : ''}`}
                    style={{ textShadow: '0 0 10px rgba(255,0,0,0.8), 0 0 20px rgba(255,0,0,0.4)' }}
                  >
                    {Math.ceil(timeLeft / 10)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              
              <div className="flex flex-col items-center space-y-2 flex-shrink-0">
                <p className="text-xs sm:text-sm font-bold text-zinc-500 uppercase tracking-widest">Who played with</p>
                <Avatar className="w-32 h-32 sm:w-40 sm:h-40 border-4 border-zinc-900 shadow-2xl ring-4 ring-zinc-800 bg-zinc-900 overflow-hidden isolate relative translate-z-0">
                  <AvatarImage 
                    src={`https://cdn.nba.com/headshots/nba/latest/260x190/${currentId}.png`} 
                    className="object-cover scale-[1.3] translate-y-3"
                    onError={handleImageError}
                  />
                  <AvatarFallback className="bg-zinc-800 text-zinc-500 text-3xl font-bold">{gameData.players[currentId].charAt(0)}</AvatarFallback>
                </Avatar>
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-100 text-center tracking-tight leading-tight">{gameData.players[currentId]}</h2>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-sm sm:max-w-md mx-auto">
                {choices.map(id => (
                  <Card 
                    key={id} 
                    onClick={() => handleGuess(id)}
                    className="group cursor-pointer border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-blue-500/50 transition-all duration-200 active:scale-[0.97] overflow-hidden shadow-md"
                  >
                    <CardContent className="p-3 sm:p-5 flex flex-col items-center justify-center gap-2 sm:gap-3">
                      <Avatar className="w-28 h-28 sm:w-32 sm:h-32 border-2 border-zinc-800 bg-zinc-950 group-hover:ring-2 group-hover:ring-blue-500/50 overflow-hidden isolate relative translate-z-0">
                        <AvatarImage 
                          src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} 
                          className="object-cover scale-[1.3] translate-y-3"
                          onError={handleImageError}
                        />
                        <AvatarFallback className="bg-zinc-800 text-xs">NBA</AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-sm sm:text-lg text-zinc-300 text-center leading-tight group-hover:text-white">{gameData.players[id]}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>

            </div>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="animate-in fade-in zoom-in-95 duration-400 flex flex-col h-full w-full pb-2">
            <Card className="w-full border-zinc-800 bg-zinc-900/90 shadow-2xl mb-4 overflow-hidden relative flex-shrink-0">
              <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-red-600 via-orange-500 to-red-600"></div>
              <CardHeader className="text-center pt-6 pb-2">
                <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-zinc-600 mx-auto mb-2" />
                <CardTitle className="text-xl sm:text-2xl text-zinc-100 font-black tracking-tight">Chain Broken</CardTitle>
              </CardHeader>
              <CardContent className="text-center pb-6">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Final Link Streak</div>
                <div className="text-5xl sm:text-6xl font-black text-blue-500">{streak}</div>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 px-4 pb-4 border-t border-zinc-800/50 pt-4 bg-black/20">
                <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 h-12 font-bold" onClick={startGame}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Play Again
                </Button>
                <Button className="h-12 bg-blue-600 text-white hover:bg-blue-500 font-bold" onClick={handleShare}>
                  <Share className="w-4 h-4 mr-2" /> Share
                </Button>
              </CardFooter>
            </Card>

            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-center flex-shrink-0">Chain History</h3>
              <div className="bg-zinc-900/80 border border-zinc-800 shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto custom-scrollbar p-2 flex-1">
                  {visitedPlayers.map((id, idx) => (
                    <div key={id + idx} className="flex flex-col">
                      <div className="flex items-center gap-3 p-2 hover:bg-zinc-800/50 rounded-lg">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 border-zinc-700 bg-zinc-950 text-zinc-400 font-bold shrink-0">{idx + 1}</Badge>
                        <Avatar className="w-10 h-10 border border-zinc-700 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate relative">
                          <AvatarImage 
                            src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} 
                            className="object-cover scale-[1.3] translate-y-1.5"
                            onError={handleImageError}
                          />
                        </Avatar>
                        <span className="font-bold text-sm sm:text-base text-zinc-200 truncate">{gameData.players[id]}</span>
                      </div>
                      {idx < visitedPlayers.length - 1 && <div className="w-full flex justify-center py-1"><LinkIcon className="w-4 h-4 text-zinc-700" /></div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}