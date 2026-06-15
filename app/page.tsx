'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link2, Trophy, RotateCcw, Share, AlertTriangle, Loader2, X, Check } from "lucide-react";

type GameData = {
  players: Record<string, string>;
  network: Record<string, Record<string, { teams: string[]; years: string[] }>>;
};

const TEAM_LOGOS: Record<string, string> = {
  "ATL": "1610612737", "BOS": "1610612738", "CLE": "1610612739", "NOP": "1610612740",
  "CHI": "1610612741", "DAL": "1610612742", "DEN": "1610612743", "GSW": "1610612744",
  "HOU": "1610612745", "LAC": "1610612746", "LAL": "1610612747", "MIA": "1610612748",
  "MIL": "1610612749", "MIN": "1610612750", "BKN": "1610612751", "NYK": "1610612752",
  "ORL": "1610612753", "IND": "1610612754", "PHI": "1610612755", "PHX": "1610612756",
  "POR": "1610612757", "SAC": "1610612758", "SAS": "1610612759", "OKC": "1610612760",
  "TOR": "1610612761", "UTA": "1610612762", "MEM": "1610612763", "WAS": "1610612764",
  "DET": "1610612765", "CHA": "1610612766"
};

const getStartYear = (yearStr: string) => {
  if (!yearStr) return 9999;
  const match = yearStr.match(/\d{2,4}/);
  if (!match) return 9999; 
  let y = parseInt(match[0], 10);
  if (y < 100) {
    y += (y < 50 ? 2000 : 1900);
  }
  return y;
};

const getStintEndSeasonStartYear = (stintStr: string) => {
  if (!stintStr) return 0;
  const seasons = stintStr.split(/\s+-\s+/);
  return getStartYear(seasons[seasons.length - 1]);
};

// Pre-processes the original timeline to merge identical teams that have a 1-season gap
const preProcessStints = (teams: string[], years: string[]) => {
  const t = teams || [];
  const y = years || [];
  const maxLen = Math.max(t.length, y.length);
  const mergedTeams: string[] = [];
  const mergedYears: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const team = t[i] || "";
    const year = y[i] || "";
    if (!team) continue;

    if (mergedTeams.length > 0 && mergedTeams[mergedTeams.length - 1] === team) {
      const prevYear = mergedYears[mergedYears.length - 1];
      const prevEndStart = getStintEndSeasonStartYear(prevYear);
      const currStartStart = getStartYear(year);

      // If the gap is 1 season (diff <= 2) and they played for NO other teams in between
      if (currStartStart - prevEndStart <= 2) {
        const startSeason = prevYear.split(/\s+-\s+/)[0];
        const endSeasons = year.split(/\s+-\s+/);
        const endSeason = endSeasons[endSeasons.length - 1];
        mergedYears[mergedYears.length - 1] = `${startSeason} - ${endSeason}`;
        continue;
      }
    }
    
    mergedTeams.push(team);
    mergedYears.push(year);
  }
  return { teams: mergedTeams, years: mergedYears };
};

const sortAndGroupStints = (rawTeams: string[], rawYears: string[]) => {
  const { teams: t, years: y } = preProcessStints(rawTeams, rawYears);
  
  const grouped: Record<string, string[]> = {};
  
  for (let i = 0; i < t.length; i++) {
    const team = t[i] || "";
    const year = y[i] || "";
    if (!team) continue;
    if (!grouped[team]) grouped[team] = [];
    if (year) grouped[team].push(year);
  }
  
  const result = Object.keys(grouped).map(team => {
    const teamYears = grouped[team];
    teamYears.sort((a, b) => getStartYear(a) - getStartYear(b));
    return {
      team,
      rawYears: teamYears,
      earliestYear: teamYears.length > 0 ? getStartYear(teamYears[0]) : 9999
    };
  });
  
  result.sort((a, b) => a.earliestYear - b.earliestYear);
  
  return {
    sortedTeams: result.map(r => r.team),
    sortedYearsArray: result.map(r => r.rawYears)
  };
};

const formatYearsList = (yearsList: string[]) => {
  if (!yearsList || yearsList.length === 0) return "";
  
  const formattedList = yearsList.map(yearStr => {
    if (!yearStr) return "";
    const blocks = yearStr.split(/\s+-\s+/);
    return blocks.map(block => {
      const parts = block.split(/[-/]/);
      return parts.map(part => {
        const clean = part.trim();
        return clean.length === 4 ? clean.slice(2) : clean;
      }).join('-');
    }).join(' → ');
  });
  
  return formattedList.filter(y => y !== "").join(', ');
};

export default function Game() {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'victory'>('start');
  
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [correctTeammateId, setCorrectTeammateId] = useState<string | null>(null);
  const [wrongGuessId, setWrongGuessId] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [visitedPlayers, setVisitedPlayers] = useState<string[]>([]);
  
  const [timeLeft, setTimeLeft] = useState(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef<number | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        if (!targetTimeRef.current) return;
        
        const now = Date.now();
        const remainingMs = Math.max(0, targetTimeRef.current - now);
        const remainingDeciseconds = Math.ceil(remainingMs / 100);
        
        setTimeLeft(remainingDeciseconds);

        if (remainingDeciseconds <= 0) {
          handleGameOver();
        }
      }, 50);
    }
    return () => clearInterval(timerRef.current as NodeJS.Timeout);
  }, [gameState]);

  useEffect(() => {
    let animationFrameId: number;
    
    if (gameState === 'gameover' || gameState === 'victory') {
      const timeoutId = setTimeout(() => {
        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const startY = container.scrollTop;
          const endY = container.scrollHeight - container.clientHeight;
          const distance = endY - startY;
          
          const duration = 1500; 
          let startTime: number | null = null;

          const animation = (currentTime: number) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            
            const ease = progress < 0.5 
              ? 4 * progress * progress * progress 
              : 1 - Math.pow(-2 * progress + 2, 3) / 2;
              
            container.scrollTop = startY + distance * ease;
            
            if (timeElapsed < duration) {
              animationFrameId = requestAnimationFrame(animation);
            }
          };
          
          animationFrameId = requestAnimationFrame(animation);
        }
      }, 50);

      return () => {
        clearTimeout(timeoutId);
        cancelAnimationFrame(animationFrameId);
      };
    }
  }, [gameState]);

  const goHome = () => {
    setGameState('start');
    targetTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startGame = () => {
    if (!gameData) return;
    setStreak(0);
    setVisitedPlayers([]);
    setWrongGuessId(null);
    
    const playerIds = Object.keys(gameData.network);
    
    let startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    while (Object.keys(gameData.network[startId]).length === 0) {
      startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    }
    
    setCurrentId(startId);
    setVisitedPlayers([startId]);
    generateRound(startId, [startId], 0);
    setGameState('playing');
  };

  const generateRound = (playerId: string, currentVisited: string[], currentStreak: number) => {
    if (!gameData) return;
    
    const teammates = Object.keys(gameData.network[playerId]);
    let validTeammates = teammates.filter(id => !currentVisited.includes(id));

    if (currentVisited.length > 1) {
      const previousId = currentVisited[currentVisited.length - 2];
      const previousTeammates = Object.keys(gameData.network[previousId]);
      const jumpingTeammates = validTeammates.filter(id => !previousTeammates.includes(id));
      if (jumpingTeammates.length > 0) validTeammates = jumpingTeammates;
    }

    if (validTeammates.length === 0) {
      if (currentStreak >= 100) {
        setGameState('victory');
      } else {
        setGameState('gameover');
      }
      targetTimeRef.current = null;
      clearInterval(timerRef.current as NodeJS.Timeout);
      return;
    }

    let correct = validTeammates[Math.floor(Math.random() * validTeammates.length)];

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
    
    targetTimeRef.current = Date.now() + 10000;
    setTimeLeft(100);
  };

  const handleGuess = (id: string) => {
    if (id === correctTeammateId) {
      const newStreak = streak + 1;
      const newVisited = [...visitedPlayers, id];
      setStreak(newStreak);
      setCurrentId(id);
      setVisitedPlayers(newVisited);
      setWrongGuessId(null);
      generateRound(id, newVisited, newStreak);
    } else {
      setWrongGuessId(id);
      handleGameOver();
    }
  };

  const handleGameOver = () => {
    setGameState('gameover');
    targetTimeRef.current = null;
    clearInterval(timerRef.current as NodeJS.Timeout);
  };

  const handleShare = async () => {
    const message = gameState === 'victory' 
      ? `🏆 BBall and Chain: ABSOLUTE CHAMPION! I completely cleared the network with a perfect streak of ${streak}! Can you match perfection?`
      : `🔗 BBall and Chain: I linked ${streak} NBA players before the chain broke! Can you beat my streak?`;
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'BBall and Chain', text: message });
        return;
      } catch (err) { console.log("Share cancelled.", err); }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(message);
      alert('Copied to clipboard!');
      return;
    }
    alert('Clipboard access blocked. Copy this text: ' + message);
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
        <div 
          onClick={goHome}
          className="flex items-center gap-2 text-zinc-100 cursor-pointer hover:opacity-80 transition-opacity active:scale-95 group"
        >
          <Link2 className="w-6 h-6 text-blue-500 group-hover:rotate-12 transition-transform" />
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

        {/* Start Screen */}
        {gameState === 'start' && (
          <div className="flex flex-col items-center justify-center h-full w-full animate-in fade-in zoom-in duration-500 pb-10">
            <div className="relative w-full">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>
              
              <Card className="w-full border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                {/* Image Background with Reduced Blur */}
                <div className="absolute inset-0 bg-[url('/background.jpg')] bg-cover bg-center bg-no-repeat opacity-20 blur-sm scale-[1.02]"></div>
                
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

        {/* Playing Screen */}
        {gameState === 'playing' && currentId && (
          <div className="flex flex-col flex-1 h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col items-center justify-center flex-1 w-full pb-6 sm:pb-12">
              
              <div className="flex flex-col items-center justify-center w-full flex-shrink-0 mb-6 sm:mb-8">
                <div className="bg-[#0a0000] border-[4px] sm:border-[6px] border-zinc-900 rounded-md px-5 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_0_15px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
                  <div className="absolute top-0 left-0 w-full h-[45%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
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

              <div className="flex flex-col items-center w-full space-y-6">
                <div className="flex flex-col items-center flex-shrink-0">
                  <p className="text-lg sm:text-xl font-black text-zinc-400 uppercase tracking-widest mb-4 sm:mb-5">Who played with</p>
                  <Avatar className="w-32 h-32 sm:w-40 sm:h-40 border-4 border-zinc-900 shadow-2xl ring-4 ring-zinc-800 bg-zinc-900 overflow-hidden isolate relative translate-z-0">
                    <AvatarImage 
                      src={`https://cdn.nba.com/headshots/nba/latest/260x190/${currentId}.png`} 
                      className="object-cover scale-[1.5] translate-y-6"
                      onError={handleImageError}
                    />
                    <AvatarFallback className="bg-zinc-800 text-zinc-500 text-3xl font-bold">{gameData.players[currentId].charAt(0)}</AvatarFallback>
                  </Avatar>
                  <h2 className="text-2xl sm:text-3xl font-black text-zinc-100 text-center tracking-tight leading-tight mt-2 sm:mt-3">{gameData.players[currentId]}</h2>
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
                            className="object-cover scale-[1.5] translate-y-6"
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
          </div>
        )}

        {/* Victory Screen */}
        {gameState === 'victory' && (
          <div className="animate-in fade-in zoom-in-95 duration-400 flex flex-col h-full w-full pb-2">
            <Card className="w-full border-amber-500/50 bg-zinc-900/90 shadow-[0_0_30px_rgba(245,158,11,0.2)] mb-3 overflow-hidden relative flex-shrink-0">
              <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500"></div>
              <CardHeader className="text-center pt-6 pb-2">
                <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-2 animate-bounce" />
                <CardTitle className="text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200 font-black tracking-tight">
                  CHAMPION!
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center pb-3 md:pb-4">
                <p className="text-zinc-400 text-xs sm:text-sm uppercase tracking-widest font-bold mb-2 max-w-xs mx-auto leading-relaxed">
                  Unbelievable! You completely cleared the available network path!
                </p>
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Final Perfect Streak</div>
                <div className="text-6xl md:text-7xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">{streak}</div>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 px-4 pb-4 md:pb-5 border-t border-zinc-800/50 pt-3 bg-amber-500/5">
                <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 h-12 font-bold" onClick={startGame}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Play Again
                </Button>
                <Button className="h-12 bg-amber-600 text-white hover:bg-amber-500 font-bold shadow-lg shadow-amber-900/20" onClick={handleShare}>
                  <Share className="w-4 h-4 mr-2" /> Share Victory
                </Button>
              </CardFooter>
            </Card>

            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-center flex-shrink-0">Winning Chain History</h3>
              <div className="bg-zinc-900/80 border border-zinc-800 shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto custom-scrollbar p-4 flex-1" ref={scrollContainerRef}>
                  
                  <div className="relative flex flex-col items-center w-full max-w-sm mx-auto">
                    {visitedPlayers.length > 1 && (
                      <div className="absolute top-6 bottom-6 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/80 z-0"></div>
                    )}

                    {visitedPlayers.map((id, idx) => {
                      const nextId = visitedPlayers[idx + 1];
                      const connection = nextId ? gameData.network[id]?.[nextId] : null;
                      
                      let sortedTeams: string[] = [];
                      let sortedYearsArray: string[][] = [];
                      if (connection) {
                        const sorted = sortAndGroupStints(connection.teams, connection.years);
                        sortedTeams = sorted.sortedTeams;
                        sortedYearsArray = sorted.sortedYearsArray;
                      }

                      return (
                        <div key={id + idx} className="flex flex-col items-center w-full relative z-10">
                          <div className="flex flex-col items-center bg-zinc-900 rounded-xl p-3 sm:p-4 border border-zinc-800/50 w-36 sm:w-44 shadow-sm shrink-0">
                            <Avatar className="w-14 h-14 sm:w-16 sm:h-16 border-2 border-zinc-800 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate relative z-10">
                              <AvatarImage 
                                src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} 
                                className="object-cover scale-[1.5] translate-y-3"
                                onError={handleImageError}
                              />
                            </Avatar>
                            <span className="font-bold text-sm sm:text-base text-zinc-200 mt-2 sm:mt-3 text-center leading-tight">{gameData.players[id]}</span>
                          </div>
                          
                          {idx < visitedPlayers.length - 1 && connection && (
                            <div className="py-3 sm:py-4 w-full flex justify-center relative z-10">
                              <div className="bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-3 flex items-center justify-center flex-wrap gap-x-4 gap-y-3 shadow-md w-max max-w-[95%] text-center">
                                {sortedTeams.map((teamAbbrev, tIdx) => {
                                  if (!teamAbbrev) return null;
                                  return (
                                    <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-2 sm:gap-2.5">
                                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
                                        {TEAM_LOGOS[teamAbbrev] ? (
                                          <img 
                                            src={`https://cdn.nba.com/logos/nba/${TEAM_LOGOS[teamAbbrev]}/global/L/logo.svg`} 
                                            alt={teamAbbrev} 
                                            className="w-full h-full object-contain p-[1px] scale-[1.15]"
                                          />
                                        ) : (
                                          <span className="text-[8px] sm:text-[10px] font-black text-black">{teamAbbrev}</span>
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm font-bold text-zinc-300 tracking-widest whitespace-nowrap">
                                        {teamAbbrev} <span className="text-zinc-500 ml-1">{formatYearsList(sortedYearsArray[tIdx])}</span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-4 w-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'gameover' && (
          <div className="animate-in fade-in zoom-in-95 duration-400 flex flex-col h-full w-full pb-2">
            <Card className="w-full border-zinc-800 bg-zinc-900/90 shadow-2xl mb-3 overflow-hidden relative flex-shrink-0">
              <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-red-600 via-orange-500 to-red-600"></div>
              <CardHeader className="text-center pt-5 pb-2">
                <CardTitle className="text-2xl sm:text-3xl md:text-4xl text-zinc-100 font-black tracking-tight">Chain Broken</CardTitle>
              </CardHeader>
              <CardContent className="text-center pb-3 md:pb-4">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Final Link Streak</div>
                <div className="text-5xl sm:text-6xl md:text-7xl font-black text-blue-500">{streak}</div>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 px-4 pb-4 md:pb-5 border-t border-zinc-800/50 pt-3 bg-black/20">
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
                <div className="overflow-y-auto custom-scrollbar p-4 flex-1 relative" ref={scrollContainerRef}>
                  
                  {/* Valid Player History Block */}
                  <div className="relative flex flex-col items-center w-full max-w-sm mx-auto">
                    {visitedPlayers.length > 1 && (
                      <div className="absolute top-6 bottom-6 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/80 z-0"></div>
                    )}

                    {/* Standard Perfect Chain Rendering */}
                    {visitedPlayers.map((id, idx) => {
                      const nextId = visitedPlayers[idx + 1];
                      const connection = nextId ? gameData.network[id]?.[nextId] : null;
                      
                      let sortedTeams: string[] = [];
                      let sortedYearsArray: string[][] = [];
                      if (connection) {
                        const sorted = sortAndGroupStints(connection.teams, connection.years);
                        sortedTeams = sorted.sortedTeams;
                        sortedYearsArray = sorted.sortedYearsArray;
                      }

                      return (
                        <div key={id + idx} className="flex flex-col items-center w-full relative z-10">
                          <div className="flex flex-col items-center bg-zinc-900 rounded-xl p-3 sm:p-4 border border-zinc-800/50 w-36 sm:w-44 shadow-sm shrink-0">
                            <Avatar className="w-14 h-14 sm:w-16 sm:h-16 border-2 border-zinc-800 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate relative z-10">
                              <AvatarImage 
                                src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} 
                                className="object-cover scale-[1.5] translate-y-3"
                                onError={handleImageError}
                              />
                            </Avatar>
                            <span className="font-bold text-sm sm:text-base text-zinc-200 mt-2 sm:mt-3 text-center leading-tight">{gameData.players[id]}</span>
                          </div>
                          
                          {idx < visitedPlayers.length - 1 && connection && (
                            <div className="py-3 sm:py-4 w-full flex justify-center relative z-10">
                              <div className="bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-3 flex items-center justify-center flex-wrap gap-x-4 gap-y-3 shadow-md w-max max-w-[95%] text-center">
                                {sortedTeams.map((teamAbbrev, tIdx) => {
                                  if (!teamAbbrev) return null;
                                  return (
                                    <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-2 sm:gap-2.5">
                                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
                                        {TEAM_LOGOS[teamAbbrev] ? (
                                          <img 
                                            src={`https://cdn.nba.com/logos/nba/${TEAM_LOGOS[teamAbbrev]}/global/L/logo.svg`} 
                                            alt={teamAbbrev} 
                                            className="w-full h-full object-contain p-[1px] scale-[1.15]"
                                          />
                                        ) : (
                                          <span className="text-[8px] sm:text-[10px] font-black text-black">{teamAbbrev}</span>
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm font-bold text-zinc-300 tracking-widest whitespace-nowrap">
                                        {teamAbbrev} <span className="text-zinc-500 ml-1">{formatYearsList(sortedYearsArray[tIdx])}</span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Fork Block */}
                  {correctTeammateId && (
                    <div className="w-full flex flex-col items-center relative z-10 mt-0 pb-1">
                      {/* Main trunk dropping down */}
                      <div className="w-[2px] h-6 sm:h-8 bg-zinc-800/80"></div>
                      
                      {/* Fork Container */}
                      <div className="w-full max-w-[95%] sm:max-w-[480px] flex items-stretch justify-between relative">
                        
                        {/* Horizontal split line exactly centered across the two drop lines */}
                        <div className="absolute top-0 left-[25%] right-[25%] h-[2px] bg-zinc-800/80"></div>
                        
                        {/* Left Column (Decoy Player) */}
                        {(() => {
                          const decoyId = wrongGuessId || choices.find(id => id !== correctTeammateId);
                          
                          return (
                            <div className="w-1/2 flex flex-col items-center px-1.5 sm:px-3 relative min-h-full">
                              {/* Continuous Line to match right column height */}
                              <div className="absolute top-0 bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/80 z-0"></div>
                              
                              {/* Spacer to push player box to bottom align */}
                              <div className="flex-1"></div>

                              {/* Standard Clean Box for Left Player with STRICT FIXED DIMENSIONS */}
                              <div className="w-36 sm:w-44 h-[160px] sm:h-[190px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col items-center justify-start shadow-sm relative z-10 mt-auto shrink-0">
                                <span className="text-[10px] sm:text-xs font-black text-red-500 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1 text-center">
                                  <X className="w-3 h-3 shrink-0"/>
                                  {wrongGuessId ? "Your Guess" : "Incorrect"}
                                </span>
                                <Avatar className="w-14 h-14 sm:w-16 sm:h-16 border-2 border-zinc-800 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate opacity-60">
                                  {decoyId && (
                                    <AvatarImage src={`https://cdn.nba.com/headshots/nba/latest/260x190/${decoyId}.png`} className="object-cover scale-[1.5] translate-y-3" onError={handleImageError} />
                                  )}
                                </Avatar>
                                <span className="font-bold text-sm sm:text-base text-zinc-500 mt-2 sm:mt-3 text-center leading-tight">
                                  {decoyId ? gameData.players[decoyId] : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Right Column (Correct Answer) */}
                        <div className="w-1/2 flex flex-col items-center px-1.5 sm:px-3 relative min-h-full">
                          {/* Continuous Line */}
                          <div className="absolute top-0 bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/80 z-0"></div>
                          
                          {/* Top Spacer matches main chain padding */}
                          <div className="h-6 sm:h-8 w-full shrink-0"></div>
                          
                          {/* Connection Badge positioned naturally in document flow */}
                          {(() => {
                            const lastId = visitedPlayers[visitedPlayers.length - 1];
                            const sharedData = gameData.network[lastId]?.[correctTeammateId];
                            if (!sharedData) return null;
                            
                            const { sortedTeams, sortedYearsArray } = sortAndGroupStints(sharedData.teams, sharedData.years);
                            
                            return (
                              <div className="w-full flex justify-center relative z-10">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-3 flex items-center justify-center flex-wrap gap-x-4 gap-y-3 shadow-md w-max max-w-[160%] sm:max-w-[130%] text-center relative right-[10%] sm:right-0">
                                  {sortedTeams.map((teamAbbrev, tIdx) => {
                                    if (!teamAbbrev) return null;
                                    return (
                                      <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-2 sm:gap-2.5">
                                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
                                          {TEAM_LOGOS[teamAbbrev] ? (
                                            <img src={`https://cdn.nba.com/logos/nba/${TEAM_LOGOS[teamAbbrev]}/global/L/logo.svg`} alt={teamAbbrev} className="w-full h-full object-contain p-[1px] scale-[1.15]" />
                                          ) : (
                                            <span className="text-[8px] sm:text-[10px] font-black text-black">{teamAbbrev}</span>
                                          )}
                                        </div>
                                        <span className="text-xs sm:text-sm font-bold text-zinc-300 tracking-widest whitespace-nowrap">
                                          {teamAbbrev} <span className="text-zinc-500 ml-1">{formatYearsList(sortedYearsArray[tIdx])}</span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )
                          })()}

                          {/* Bottom Spacer matches main chain padding */}
                          <div className="h-6 sm:h-8 w-full shrink-0"></div>

                          {/* Standard Clean Box for Right Player with STRICT FIXED DIMENSIONS */}
                          <div className="w-36 sm:w-44 h-[160px] sm:h-[190px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col items-center justify-start shadow-sm relative z-10 mt-auto shrink-0">
                            <span className="text-[10px] sm:text-xs font-black text-green-500 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1 text-center">
                              <Check className="w-3 h-3 shrink-0"/> Correct
                            </span>
                            <Avatar className="w-14 h-14 sm:w-16 sm:h-16 border-2 border-zinc-800 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate">
                              <AvatarImage src={`https://cdn.nba.com/headshots/nba/latest/260x190/${correctTeammateId}.png`} className="object-cover scale-[1.5] translate-y-3" onError={handleImageError} />
                            </Avatar>
                            <span className="font-bold text-sm sm:text-base text-zinc-200 mt-2 sm:mt-3 text-center leading-tight">{gameData.players[correctTeammateId]}</span>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                  <div className="h-4 w-full" />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}