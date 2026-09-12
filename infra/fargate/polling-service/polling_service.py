#!/usr/bin/env python3
"""
Live Polling Service for Fantasy Football vs Everyone

This service runs in ECS Fargate and polls the Sleeper API every 10 seconds
during active game periods. It fetches live matchup data and calculates
standings directly using the shared ff_standings library.
"""

import time
import os
import logging
import signal
import sys
from datetime import datetime, timezone
import requests
import boto3

# Import shared standings library
from ff_standings import StandingsService
from ff_standings.storage import StandingsStorage
from ff_utils.league_context import LeagueContextError, resolve_league_context_from_env

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PollingService:
    def __init__(self):
        """Initialize the polling service with AWS clients and environment variables"""
        self.league_id = None
        self.poll_interval = 10  # seconds
        self.running = True
        
        # AWS clients
        self.dynamodb = boto3.resource('dynamodb')
        
        # DynamoDB tables
        self.league_data_table = self.dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
        self.polling_state_table = self.dynamodb.Table(os.environ['POLLING_STATE_TABLE'])
        self.weekly_standings_table = self.dynamodb.Table(os.environ['WEEKLY_STANDINGS_TABLE'])
        self.overall_standings_table = self.dynamodb.Table(os.environ['OVERALL_STANDINGS_TABLE'])
        
        # Initialize shared standings service with persistent caching
        dynamodb_tables = {
            'league_data': self.league_data_table,
            'weekly_standings': self.weekly_standings_table,
            'overall_standings': self.overall_standings_table
        }
        self.standings_service = StandingsService(dynamodb_tables, enable_persistent_cache=True)
        
        # Initialize storage helper for float-to-decimal conversion
        self.storage_helper = StandingsStorage(self.weekly_standings_table, self.overall_standings_table)
        
        # State tracking
        self.current_week = None
        self.current_season = None
        self.last_matchup_hash = None
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self.signal_handler)
        signal.signal(signal.SIGINT, self.signal_handler)
        
        logger.info(f"Polling service initialized for league {self.league_id}")


    def signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False

    def get_league_context(self):
        """Resolve the active season, week, and season-specific league."""
        try:
            context = resolve_league_context_from_env()
            resolved_position = (
                context['league_id'],
                context['season'],
                context['week'],
            )
            current_position = (
                self.league_id,
                self.current_season,
                self.current_week,
            )
            if resolved_position != current_position:
                self.last_matchup_hash = None

            self.league_id = context['league_id']
            self.current_season = context['season']
            self.current_week = context['week']
            
            logger.info(
                f"League context - League: {self.league_id}, "
                f"Season: {self.current_season}, Week: {self.current_week}"
            )
            return context
            
        except LeagueContextError as e:
            logger.critical(f"Failed to resolve league context: {e}")
            self.running = False
            raise

    def fetch_current_matchups(self):
        """Fetch current week's matchup data from Sleeper API"""
        if not self.current_week:
            logger.warning("No current week available, skipping matchup fetch")
            return None
            
        try:
            url = f'https://api.sleeper.app/v1/league/{self.league_id}/matchups/{self.current_week}'
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            matchups = response.json()
            
            logger.info(f"Fetched {len(matchups)} matchups for week {self.current_week}")
            return matchups
            
        except requests.RequestException as e:
            logger.error(f"Failed to fetch matchups for week {self.current_week}: {e}")
            return None

    def calculate_matchup_hash(self, matchups):
        """Calculate a hash of matchup data to detect changes"""
        if not matchups:
            return None
            
        # Create a simple hash based on roster IDs and points
        hash_data = []
        for matchup in matchups:
            roster_id = matchup.get('roster_id')
            points = matchup.get('points', 0)
            hash_data.append(f"{roster_id}:{points}")
        
        return hash("|".join(sorted(hash_data)))

    def store_matchup_data(self, matchups):
        """Store matchup data in DynamoDB"""
        try:
            self.league_data_table.put_item(Item=self.storage_helper.convert_floats_to_decimal({
                'data_type': 'matchups',
                'id': f'{self.current_season}_{self.current_week}',
                'season': self.current_season,
                'league_id': self.league_id,
                'week': self.current_week,
                'data': matchups,
                'last_updated': datetime.now(timezone.utc).isoformat(),
                'source': 'live-polling'
            }))
            
            logger.info(f"Stored matchup data for week {self.current_week}")
            
        except Exception as e:
            logger.error(f"Failed to store matchup data: {e}")


    def update_polling_state(self, status='running'):
        """Update polling state heartbeat in DynamoDB without overwriting enabled flag"""
        try:
            # Use update_item instead of put_item to avoid overwriting the 'enabled' field
            self.polling_state_table.update_item(
                Key={'id': 'polling_status'},
                UpdateExpression=(
                    'SET #status = :status, last_heartbeat = :heartbeat, '
                    'current_week = :week, current_season = :season, '
                    'league_id = :league_id'
                ),
                ExpressionAttributeNames={
                    '#status': 'status'
                },
                ExpressionAttributeValues={
                    ':status': status,
                    ':heartbeat': datetime.now(timezone.utc).isoformat(),
                    ':week': self.current_week,
                    ':season': self.current_season,
                    ':league_id': self.league_id
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update polling state: {e}")

    def should_continue_polling(self):
        """Check if polling should continue by checking DynamoDB state"""
        try:
            response = self.polling_state_table.get_item(Key={'id': 'polling_status'})
            item = response.get('Item', {})
            return item.get('enabled', False) and self.running
        except Exception as e:
            logger.warning(f"Failed to check polling state: {e}")
            return self.running

    def run_polling_cycle(self):
        """Execute one polling cycle"""
        # Update NFL state periodically (every few cycles)
        if not hasattr(self, '_last_nfl_check') or \
           (datetime.now().timestamp() - self._last_nfl_check) > 300:  # 5 minutes
            self.get_league_context()
            self._last_nfl_check = datetime.now().timestamp()

        # Fetch current matchups
        matchups = self.fetch_current_matchups()
        
        if matchups:
            # Calculate hash to detect changes
            new_hash = self.calculate_matchup_hash(matchups)
            
            if new_hash != self.last_matchup_hash:
                logger.info("Matchup data changed, updating standings...")
                
                # Store updated matchup data
                self.store_matchup_data(matchups)
                
                # Calculate and store standings directly (no Lambda call!)
                try:
                    weekly_results = self.standings_service.calculate_and_store(
                        matchups, 
                        self.league_id,
                        self.current_season, 
                        self.current_week,
                        include_player_details=True  # Include full roster details
                    )
                    logger.info(f"Updated standings for {len(weekly_results)} teams")
                except Exception as e:
                    logger.error(f"Failed to calculate standings: {e}")
                
                # Update hash
                self.last_matchup_hash = new_hash
                
            else:
                logger.debug("No changes in matchup data")
        
        # Update polling state heartbeat
        self.update_polling_state('running')

    def run(self):
        """Main polling loop"""
        logger.info("Starting polling service...")
        
        # Initial setup
        self.get_league_context()
        self.standings_service.load_cache(
            self.league_id,
            self.current_season,
        )  # Load players and team names once
        self.update_polling_state('starting')
        
        while self.should_continue_polling():
            try:
                start_time = time.time()
                
                # Run polling cycle
                self.run_polling_cycle()
                
                # Calculate sleep time to maintain consistent interval
                elapsed_time = time.time() - start_time
                sleep_time = max(0, self.poll_interval - elapsed_time)
                
                if sleep_time > 0:
                    logger.debug(f"Sleeping for {sleep_time:.2f} seconds")
                    time.sleep(sleep_time)
                    
            except Exception as e:
                logger.error(f"Error in polling cycle: {e}")
                # Sleep on error to avoid rapid failure loops
                time.sleep(self.poll_interval)
        
        logger.info("Polling service stopped")
        self.update_polling_state('stopped')

def main():
    """Main entry point"""
    logger.info("Fantasy Football Live Polling Service starting...")
    
    try:
        service = PollingService()
        service.run()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
    
    logger.info("Service shutdown complete")

if __name__ == '__main__':
    main()
