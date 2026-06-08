import { Routes, Route } from 'react-router-dom';
import { useGameSocket } from './hooks/useGameSocket.js';
import LobbyPage from './components/lobby/LobbyPage.js';
import RoomPage from './components/lobby/RoomPage.js';
import GamePage from './components/layout/GamePage.js';

export default function App() {
  useGameSocket();
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/game/:gameId" element={<GamePage />} />
    </Routes>
  );
}
