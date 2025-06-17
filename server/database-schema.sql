-- Game Sessions Table
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    room_id VARCHAR(255),
    action_count INTEGER DEFAULT 0 NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    game_state VARCHAR(50) DEFAULT 'setup', -- 'setup', 'active', 'ended'
    winner VARCHAR(50), -- 'player1', 'player2', 'draw', null
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    client_timezone VARCHAR(100),
    version VARCHAR(50) DEFAULT '1.0'
);

-- Players Table
CREATE TABLE game_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id VARCHAR(50) NOT NULL, -- 'player1' or 'player2'
    deck_name VARCHAR(255),
    deck_data JSONB, -- Stores the slimmed deck cards
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(session_id, player_id)
);

-- Game Actions Table
CREATE TABLE game_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    sequence_number INTEGER NOT NULL,
    player_id VARCHAR(50) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_data JSONB, -- Stores the slimmed action data
    board_state JSONB, -- Optional: only for critical actions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(session_id, sequence_number)
);

-- Snapshot Table for periodic full board states
CREATE TABLE IF NOT EXISTS game_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, sequence_no)
);

-- Indexes for performance
CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_game_sessions_start_time ON game_sessions(start_time);
CREATE INDEX idx_game_sessions_state ON game_sessions(game_state);
CREATE INDEX idx_game_actions_session_id ON game_actions(session_id);
CREATE INDEX idx_game_actions_timestamp ON game_actions(timestamp);
CREATE INDEX idx_game_actions_player_action ON game_actions(player_id, action_type);

-- Index to speed up replay queries
CREATE INDEX IF NOT EXISTS idx_snapshots_session_seq ON game_snapshots(session_id, sequence_no);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_game_sessions_updated_at 
    BEFORE UPDATE ON game_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();