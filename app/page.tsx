'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, RotateCcw, Share, AlertTriangle, Loader2, X, Check } from "lucide-react";

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
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'victory' | 'about'>('start');
  
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [correctTeammateId, setCorrectTeammateId] = useState<string | null>(null);
  const [wrongGuessId, setWrongGuessId] = useState<string | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [chainLength, setChainLength] = useState(1);
  const [visitedPlayers, setVisitedPlayers] = useState<string[]>([]);
  
  // Animation states
  const mainAvatarRef = useRef<HTMLDivElement>(null);
  const choiceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [animatingRects, setAnimatingRects] = useState<{ start: DOMRect; end: DOMRect } | null>(null);
  const [animatingMove, setAnimatingMove] = useState(false);

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
    // The shot clock keeps ticking even if an animation is happening
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
    setChainLength(1);
    setVisitedPlayers([]);
    setWrongGuessId(null);
    setSelectedChoiceId(null);
    setAnimatingId(null);
    setAnimatingRects(null);
    setAnimatingMove(false);
    
    const playerIds = Object.keys(gameData.network);
    
    let startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    while (Object.keys(gameData.network[startId]).length === 0) {
      startId = playerIds[Math.floor(Math.random() * playerIds.length)];
    }
    
    setCurrentId(startId);
    setVisitedPlayers([startId]);
    generateRound(startId, [startId], 1);
    setGameState('playing');
  };

  const generateRound = (playerId: string, currentVisited: string[], currentChainLength: number) => {
    if (!gameData) return;
    setSelectedChoiceId(null);
    
    const teammates = Object.keys(gameData.network[playerId]);
    let validTeammates = teammates.filter(id => !currentVisited.includes(id));

    if (currentVisited.length > 1) {
      const previousId = currentVisited[currentVisited.length - 2];
      const previousTeammates = Object.keys(gameData.network[previousId]);
      const jumpingTeammates = validTeammates.filter(id => !previousTeammates.includes(id));
      if (jumpingTeammates.length > 0) validTeammates = jumpingTeammates;
    }

    if (validTeammates.length === 0) {
      setGameState('victory');
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
    if (animatingId || selectedChoiceId) return;

    setSelectedChoiceId(id);

    if (id === correctTeammateId) {
      // Pad the timer so we don't accidentally game over during the animation 
      // visually keeping it ticking seamlessly. It resets in generateRound upon landing.
      if (targetTimeRef.current) targetTimeRef.current += 1000;

      const startNode = choiceRefs.current[id];
      const endNode = mainAvatarRef.current;

      if (startNode && endNode) {
        const start = startNode.getBoundingClientRect();
        const end = endNode.getBoundingClientRect();

        // Let the tap selection register before fading choices into the slide.
        setTimeout(() => {
          setAnimatingId(id);
          setAnimatingRects({ start, end });
          setAnimatingMove(false);

          setTimeout(() => {
            setAnimatingMove(true);

            // Give the slide 500ms to arrive
            setTimeout(() => {
              const newChainLength = chainLength + 1;
              const newVisited = [...visitedPlayers, id];
              
              // Generate round updates the main UI immediately
              setChainLength(newChainLength);
              setCurrentId(id);
              setVisitedPlayers(newVisited);
              setWrongGuessId(null);
              generateRound(id, newVisited, newChainLength);
              
              // Let the DOM settle & browser paint for 50ms while the clone covers the jolt, 
              // then unmount the clone silently.
              setTimeout(() => {
                setAnimatingId(null);
                setAnimatingRects(null);
                setAnimatingMove(false);
              }, 50);

            }, 500); 
          }, 75);
        }, 140);
      } else {
        const newChainLength = chainLength + 1;
        const newVisited = [...visitedPlayers, id];
        setChainLength(newChainLength);
        setCurrentId(id);
        setVisitedPlayers(newVisited);
        setWrongGuessId(null);
        generateRound(id, newVisited, newChainLength);
      }
    } else {
      setWrongGuessId(id);
      setTimeout(handleGameOver, 180);
    }
  };

  const handleGameOver = () => {
    setGameState('gameover');
    targetTimeRef.current = null;
    clearInterval(timerRef.current as NodeJS.Timeout);
  };

  const handleShare = async () => {
    const playerText = chainLength === 1 ? 'player' : 'players';
    const message = gameState === 'victory' 
      ? `🏆 BBall and Chain: I completely cleared the network with a max chain of ${chainLength}!\n\nbballandchain.com`
      : `🔗 BBall and Chain: I linked ${chainLength} NBA ${playerText} before the chain broke! Can you beat that?\n\nbballandchain.com`;
    
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
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-6 text-center overflow-hidden touch-none">
      <Card className="max-w-md w-full border-red-900/50 bg-red-950/20 shadow-xl backdrop-blur-sm rounded-3xl">
        <CardHeader>
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
          <CardTitle className="text-xl text-zinc-100">Data Connection Lost</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400 text-sm font-mono bg-black/50 p-3 rounded-2xl">{fetchError}</p>
        </CardContent>
      </Card>
    </div>
  );

  if (!gameData) return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden touch-none">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
      <p className="text-zinc-500 font-bold tracking-widest uppercase text-sm animate-pulse">Initializing Roster...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden overscroll-none touch-none bg-zinc-950 text-zinc-100 flex flex-col items-center p-3 sm:p-6 font-sans selection:bg-blue-500/30">
      
      <header className="w-full max-w-xl h-10 sm:h-12 flex justify-between items-center mb-4 flex-shrink-0 z-50 relative">
        <div 
          onClick={() => setGameState('about')}
          className={`absolute left-0 top-1/2 -translate-y-1/2 transition-opacity duration-700 ease-in-out flex items-center justify-center bg-[#0a0a0a] border border-zinc-800 rounded-full shadow-sm cursor-pointer hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 group z-50
          ${gameState === 'start' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <span className="font-black text-lg sm:text-xl tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent px-4 py-1.5 whitespace-nowrap">About</span>
        </div>

        <div 
          onClick={goHome}
          className={`absolute flex items-center justify-center rounded-full cursor-pointer transition-all duration-700 ease-in-out z-50 group origin-center
            ${gameState === 'start'
              ? 'top-[29dvh] sm:top-[33dvh] left-1/2 -translate-x-1/2 -translate-y-1/2 scale-[2.2] sm:scale-[2.6] bg-transparent border-transparent drop-shadow-md hover:scale-[2.25] sm:hover:scale-[2.65]'
              : 'top-1/2 left-0 -translate-y-1/2 translate-x-0 scale-100 bg-[#0a0a0a] border border-zinc-800 shadow-sm hover:bg-zinc-800 hover:border-zinc-700 active:scale-95'
            }
          `}
        >
          <span className="font-black text-lg sm:text-xl tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent px-4 py-1.5 whitespace-nowrap">BBall and Chain</span>
        </div>

        <div className="flex-1" />

        <div className={`flex items-center bg-[#0a0a0a] border border-zinc-800 rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-opacity duration-300
          ${gameState === 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <span className="text-[10px] sm:text-xs font-bold text-zinc-500 uppercase tracking-widest mr-2 sm:mr-3 mt-0.5">Active Chain</span>
          <span className="font-black text-lg sm:text-xl text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]">{chainLength}</span>
        </div>
      </header>

      <div className="w-full max-w-xl flex-1 flex flex-col min-h-0 relative overflow-hidden">

        {/* Start Screen */}
        {gameState === 'start' && (
          <div className="flex flex-col flex-1 h-full w-full animate-in fade-in zoom-in duration-500 pb-4 sm:pb-6">
            <div className="relative w-full h-full flex flex-col flex-1 min-h-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>
              
              <Card 
                className="w-full h-full flex-1 border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden !rounded-3xl flex flex-col isolate"
                style={{ transform: 'translateZ(0)' }}
              >
                
                <div className="absolute inset-0 bg-[url('/background.jpg')] bg-cover bg-center bg-no-repeat opacity-20 blur-sm pointer-events-none !rounded-3xl"></div>
                
                <div className="relative z-10 flex flex-col items-center flex-1 p-6 sm:p-10 text-center h-full">
                  <div className="flex h-full w-full max-w-sm flex-col items-center mx-auto">
                    <div className="h-[20dvh] sm:h-[24dvh] w-full shrink-0" />
                    <p className="text-zinc-300 font-medium text-sm sm:text-base leading-relaxed px-2">
                      Connect NBA players who have played together. One wrong link or an expired shot clock ends your chain.
                    </p>
                    <div className="flex-1 min-h-10" />
                    <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg sm:text-xl h-14 sm:h-16 font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] rounded-2xl" onClick={startGame}>
                      Start New Chain
                    </Button>
                    <div className="h-20 sm:h-24 w-full shrink-0" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* About Screen */}
        {gameState === 'about' && (
          <div className="flex flex-col flex-1 h-full w-full animate-in fade-in zoom-in duration-500 pb-4 sm:pb-6">
            <div className="relative w-full h-full flex flex-col flex-1 min-h-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>
              <Card 
                className="w-full h-full flex-1 border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden !rounded-3xl flex flex-col isolate"
                style={{ transform: 'translateZ(0)' }}
              >
                <div className="absolute inset-0 bg-[url('/background.jpg')] bg-cover bg-center bg-no-repeat opacity-20 blur-sm pointer-events-none !rounded-3xl"></div>
                
                <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6 sm:p-10 text-center h-full">
                  <div className="flex flex-col items-center justify-center w-full flex-1">
                    <CardTitle className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 tracking-tight leading-[1.1] mb-6">
                      About the game
                    </CardTitle>
                    <p className="text-zinc-300 text-sm sm:text-base leading-relaxed max-w-sm mx-auto px-2 mb-4">
                      BBall and Chain is the ultimate test of your NBA teammate knowledge.
                    </p>
                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto px-2">
                      The game presents you with a player and two potential teammates. One extends your chain. The other ends it. Choose wisely.
                    </p>
                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto px-2 mt-4 font-bold">
                      Any questions? Feel free to contact me on Instagram: @bballandchain
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Playing Screen */}
        {gameState === 'playing' && currentId && (
          <div className="flex flex-col flex-1 h-full min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col items-center justify-center flex-1 w-full pb-6 sm:pb-12">
              
              <div className="flex flex-col items-center justify-center w-full flex-shrink-0 mb-6 sm:mb-8">
                <div className="bg-[#0a0000] border-[4px] sm:border-[6px] border-zinc-900 rounded-2xl px-5 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_0_15px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
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
                
                {/* Main Player Anchor - Note: Transition removed so opacity-100 toggles instantly */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <p className="text-lg sm:text-xl font-black text-zinc-400 uppercase tracking-widest mb-4 sm:mb-5">Who played with</p>
                  <div className={`flex flex-col items-center ${animatingId ? 'opacity-0' : 'opacity-100'}`}>
                    <div ref={mainAvatarRef} className="w-32 h-32 sm:w-40 sm:h-40 rounded-full">
                      <Avatar className="w-full h-full border-4 border-zinc-900 shadow-2xl ring-4 ring-zinc-800 bg-zinc-900 overflow-hidden isolate relative translate-z-0">
                        <AvatarImage 
                          src={`https://cdn.nba.com/headshots/nba/latest/260x190/${currentId}.png`} 
                          className="object-cover scale-[1.5] translate-y-6"
                          onError={handleImageError}
                        />
                        <AvatarFallback className="bg-zinc-800 text-zinc-500 text-3xl font-bold">{gameData.players[currentId].charAt(0)}</AvatarFallback>
                      </Avatar>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-zinc-100 text-center tracking-tight leading-tight mt-2 sm:mt-3">{gameData.players[currentId]}</h2>
                  </div>
                </div>

                {/* Choices Array - selected choice briefly registers before animation */}
                <div 
                  key={chainLength} 
                  className={`grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-sm sm:max-w-md mx-auto 
                    ${animatingId ? 'opacity-0 transition-opacity duration-75' : 'animate-in fade-in duration-300'}`}
                >
                  {choices.map(id => {
                    const isSelected = selectedChoiceId === id;
                    const isCorrectSelection = isSelected && id === correctTeammateId;

                    return (
                    <Card 
                      key={id} 
                      onClick={() => handleGuess(id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleGuess(id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-zinc-900/60 shadow-md transition-all duration-200 sm:rounded-[1.5rem]
                        ${isSelected && isCorrectSelection
                          ? 'scale-[0.99] border-green-500/70 bg-zinc-900/70 ring-2 ring-green-500/20'
                          : isSelected
                            ? 'scale-[0.99] border-red-500/70 bg-zinc-900/70 ring-2 ring-red-500/20'
                            : 'border-zinc-800 hover:bg-zinc-800 active:scale-[0.97]'
                        }
                        ${selectedChoiceId && !isSelected ? 'opacity-75' : 'opacity-100'}`}
                    >
                      <CardContent className="p-3 sm:p-5 flex flex-col items-center justify-center gap-2 sm:gap-3">
                        <div ref={(el) => { if (el) choiceRefs.current[id] = el; else delete choiceRefs.current[id]; }} className="w-28 h-28 sm:w-32 sm:h-32 rounded-full relative">
                          <Avatar className={`w-full h-full border-2 bg-zinc-950 overflow-hidden isolate relative translate-z-0 transition-all duration-200 ${
                            isSelected ? 'border-zinc-700' : 'border-zinc-800'
                          }`}>
                            <AvatarImage 
                              src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} 
                              className="object-cover scale-[1.5] translate-y-6"
                              onError={handleImageError}
                            />
                            <AvatarFallback className="bg-zinc-800 text-xs">NBA</AvatarFallback>
                          </Avatar>
                        </div>
                        <span className={`font-bold text-sm sm:text-lg text-center leading-tight transition-colors ${
                          isSelected ? 'text-white' : 'text-zinc-300'
                        }`}>{gameData.players[id]}</span>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Victory Screen */}
        {gameState === 'victory' && (
           <div className="animate-in fade-in zoom-in-95 duration-400 flex flex-col h-full w-full pb-2">
           <Card className="w-full border-amber-500/50 bg-zinc-900/90 shadow-[0_0_30px_rgba(245,158,11,0.2)] mb-2 overflow-hidden relative flex-shrink-0 rounded-3xl">
             <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-80"></div>
             
             <CardHeader className="text-center pt-3 pb-0">
               <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500 mx-auto mb-1 animate-bounce" />
               <CardTitle className="text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200 font-black tracking-tight">
                 THAT&apos;S ALL, FOLKS!
               </CardTitle>
             </CardHeader>
             
             <CardContent className="text-center pb-2 pt-1 px-4">
               <p className="text-zinc-400 text-[10px] sm:text-xs uppercase tracking-widest font-bold mb-1 max-w-xs mx-auto leading-relaxed">
                 You completely ran out of valid teammates to connect!
               </p>
               <div className="text-[10px] sm:text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Final Max Chain Length</div>
               <div className="text-5xl sm:text-6xl md:text-7xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] leading-none -mb-1">{chainLength}</div>
             </CardContent>
             
             <CardFooter className="grid grid-cols-2 gap-2 px-3 sm:px-4 py-2 sm:py-3 border-t border-zinc-800/50 bg-amber-500/5">
               <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 h-11 sm:h-12 font-bold rounded-2xl" onClick={startGame}>
                 <RotateCcw className="w-4 h-4 mr-2" /> Play Again
               </Button>
               <Button className="h-11 sm:h-12 bg-amber-600 text-white hover:bg-amber-500 font-bold shadow-lg shadow-amber-900/20 rounded-2xl" onClick={handleShare}>
                 <Share className="w-4 h-4 mr-2" /> Share Victory
               </Button>
             </CardFooter>
           </Card>

           <div className="flex-1 flex flex-col min-h-0">
             <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-center flex-shrink-0">Winning Chain History</h3>
             <div className="bg-zinc-900/80 border border-zinc-800 shadow-sm rounded-3xl overflow-hidden flex-1 flex flex-col min-h-0">
               <div className="overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar px-2 sm:px-4 pt-2 pb-0 flex-1 relative min-h-0" ref={scrollContainerRef}>
                 
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
                         <div className="flex flex-col items-center bg-zinc-900 rounded-[1.5rem] p-3 sm:p-4 border border-zinc-800/50 w-36 sm:w-44 shadow-sm shrink-0">
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
                             <div className="bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col items-center justify-center gap-1.5 sm:gap-2 shadow-md w-max max-w-[95%] text-center">
                               {sortedTeams.map((teamAbbrev, tIdx) => {
                                 if (!teamAbbrev) return null;
                                 return (
                                   <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-1.5 sm:gap-2 w-max">
                                     <div className="w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
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
                                     <span className="text-[11px] sm:text-[13px] font-bold text-zinc-300 tracking-widest whitespace-nowrap">
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
                 <div className="h-2 w-full shrink-0" />
               </div>
             </div>
           </div>
         </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'gameover' && (
          <div className="animate-in fade-in zoom-in-95 duration-400 flex flex-col h-full w-full pb-2">
            <Card className="w-full border-zinc-800 bg-zinc-900/90 shadow-2xl mb-2 overflow-hidden relative flex-shrink-0 rounded-3xl">
              <div className="absolute top-0 w-full h-1.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-80"></div>
              
              <CardHeader className="text-center pt-4 pb-1">
                <CardTitle className="text-2xl sm:text-3xl md:text-4xl text-zinc-100 font-black tracking-tight">Chain Broken</CardTitle>
              </CardHeader>
              
              <CardContent className="text-center pb-2 pt-1 px-4">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Final Chain Length</div>
                <div className="text-5xl sm:text-6xl md:text-7xl font-black text-blue-500 leading-none -mb-1">{chainLength}</div>
              </CardContent>
              
              <CardFooter className="grid grid-cols-2 gap-2 px-3 sm:px-4 py-3 border-t border-zinc-800/50 bg-black/20">
                <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 h-11 sm:h-12 font-bold rounded-2xl" onClick={startGame}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Play Again
                </Button>
                <Button className="h-11 sm:h-12 bg-blue-600 text-white hover:bg-blue-500 font-bold rounded-2xl" onClick={handleShare}>
                  <Share className="w-4 h-4 mr-2" /> Share
                </Button>
              </CardFooter>
            </Card>

            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 text-center flex-shrink-0">Chain History</h3>
              <div className="bg-zinc-900/80 border border-zinc-800 shadow-sm rounded-3xl overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar px-2 sm:px-4 pt-2 pb-0 flex-1 relative min-h-0" ref={scrollContainerRef}>
                  
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
                          <div className="flex flex-col items-center bg-zinc-900 rounded-[1.5rem] p-3 sm:p-4 border border-zinc-800/50 w-36 sm:w-44 shadow-sm shrink-0">
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
                              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col items-center justify-center gap-1.5 sm:gap-2 shadow-md w-max max-w-[95%] text-center">
                                {sortedTeams.map((teamAbbrev, tIdx) => {
                                  if (!teamAbbrev) return null;
                                  return (
                                    <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-1.5 sm:gap-2 w-max">
                                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
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
                                      <span className="text-[11px] sm:text-[13px] font-bold text-zinc-300 tracking-widest whitespace-nowrap">
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
                    <div className="w-full flex flex-col items-center relative z-10 mt-0 pb-0 mb-0 history-fork">
                      
                      <div className="w-[2px] h-3 sm:h-4 bg-zinc-800/80 shrink-0"></div>

                      <div className="w-full max-w-[95%] sm:max-w-[480px] flex flex-col items-center relative z-10 mt-0 pb-0">
                        
                        <div className="absolute top-0 left-[25%] right-[25%] h-[2px] bg-zinc-800/80 z-0"></div>
                        
                        <div className="flex w-full relative items-stretch">
                          {choices.map((id, choiceIdx) => {
                            const isCorrect = (id === correctTeammateId);
                            const lastVisitedId = visitedPlayers[visitedPlayers.length - 1];
                            const sharedData = isCorrect ? gameData.network[lastVisitedId]?.[correctTeammateId] : null;
                            
                            let sortedTeams: string[] = [];
                            let sortedYearsArray: string[][] = [];
                            if (sharedData) {
                              const sorted = sortAndGroupStints(sharedData.teams, sharedData.years);
                              sortedTeams = sorted.sortedTeams;
                              sortedYearsArray = sorted.sortedYearsArray;
                            }

                            return (
                              <div key={`fork-top-${choiceIdx}`} className="w-1/2 relative flex items-start justify-center py-3 sm:py-4">
                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-zinc-800/80 z-0"></div>
                                {sharedData && (
                                  <div className="relative z-10 w-max">
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col items-center justify-center gap-1.5 sm:gap-2 shadow-md shrink-0 pointer-events-auto w-max text-center">
                                      {sortedTeams.map((teamAbbrev, tIdx) => {
                                        if (!teamAbbrev) return null;
                                        return (
                                          <div key={`${teamAbbrev}-${tIdx}`} className="flex items-center gap-1.5 sm:gap-2 w-max">
                                            <div className="w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center border border-zinc-700 shrink-0 overflow-hidden shadow-sm">
                                              {TEAM_LOGOS[teamAbbrev] ? (
                                                <img src={`https://cdn.nba.com/logos/nba/${TEAM_LOGOS[teamAbbrev]}/global/L/logo.svg`} alt={teamAbbrev} className="w-full h-full object-contain p-[1px] scale-[1.15]" />
                                              ) : (
                                                <span className="text-[8px] sm:text-[10px] font-black text-black">{teamAbbrev}</span>
                                              )}
                                            </div>
                                            <span className="text-[11px] sm:text-[13px] font-bold text-zinc-300 tracking-widest whitespace-nowrap">
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

                        <div className="flex w-full items-stretch justify-center mt-0 px-1 sm:px-2">
                          {choices.map((id, choiceIdx) => {
                            const isCorrect = (id === correctTeammateId);
                            const isGuess = (wrongGuessId && id === wrongGuessId);

                            return (
                              <div key={`fork-bottom-${choiceIdx}`} className="w-1/2 flex justify-center px-1.5 sm:px-3">
                                <div className="w-36 sm:w-44 h-full bg-zinc-900 border border-zinc-800 rounded-[1.5rem] px-3 py-3 sm:px-4 sm:py-4 flex flex-col items-center justify-start shadow-sm relative z-10">
                                  
                                  {isCorrect ? (
                                    <span className="text-[10px] sm:text-xs font-black text-green-500 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1 text-center shrink-0">
                                      <Check className="w-3 h-3 shrink-0"/> Correct
                                    </span>
                                  ) : (
                                    <span className="text-[10px] sm:text-xs font-black text-red-500 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1 text-center shrink-0">
                                      <X className="w-3 h-3 shrink-0"/>
                                      {isGuess ? "Your Guess" : "Incorrect"}
                                    </span>
                                  )}

                                  <Avatar className={`w-14 h-14 sm:w-16 sm:h-16 border-2 border-zinc-800 bg-zinc-950 shrink-0 shadow-sm overflow-hidden isolate ${!isCorrect ? 'opacity-60' : ''}`}>
                                    <AvatarImage src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} className="object-cover scale-[1.5] translate-y-3" onError={handleImageError} />
                                  </Avatar>
                                  
                                  <span className={`font-bold text-sm sm:text-base ${isCorrect ? 'text-zinc-200' : 'text-zinc-500'} mt-2 sm:mt-3 text-center leading-tight shrink-0`}>
                                    {gameData.players[id]}
                                  </span>

                                </div>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    </div>
                  )}
                  <div className="h-2 w-full shrink-0" />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Sliding Clone Overlay layer - smooth cubic bezier timing */}
      {animatingId && animatingRects && (
        <div
          style={{
            position: 'fixed',
            top: animatingMove ? animatingRects.end.top : animatingRects.start.top,
            left: animatingMove ? animatingRects.end.left : animatingRects.start.left,
            width: animatingMove ? animatingRects.end.width : animatingRects.start.width,
            height: animatingMove ? animatingRects.end.height : animatingRects.start.height,
            transition: 'all 500ms cubic-bezier(0.25, 1, 0.5, 1)',
            zIndex: 100,
            pointerEvents: 'none',
          }}
          className={`rounded-full overflow-hidden isolate flex justify-center shadow-2xl ${
            animatingMove
              ? 'border-4 border-zinc-900 ring-4 ring-zinc-800 bg-zinc-900'
              : 'border-2 border-zinc-800 ring-0 bg-zinc-950'
          }`}
        >
          <img
            src={`https://cdn.nba.com/headshots/nba/latest/260x190/${animatingId}.png`}
            className="object-cover scale-[1.5] translate-y-6 w-full h-full"
            onError={handleImageError}
            alt="Sliding Player"
          />
        </div>
      )}
    </div>
  );
}
