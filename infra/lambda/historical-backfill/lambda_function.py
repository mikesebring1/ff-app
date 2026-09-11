import json
import boto3
import os
import requests
import logging

# Import shared libraries
from ff_standings import StandingsService
from ff_utils.dynamodb import convert_floats_to_decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    """
    Historical data backfill Lambda:
    1. Fetch current NFL state to determine completed weeks
    2. For each completed week, fetch matchup data from Sleeper
    3. Store league data (users, rosters, players) if not already cached
    4. Calculate and store standings directly using shared library
    """
    
    try:
        # Initialize environment variables
        league_id = os.environ['SLEEPER_LEAGUE_ID']
        league_data_table = dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
        weekly_standings_table = dynamodb.Table(os.environ['WEEKLY_STANDINGS_TABLE'])
        overall_standings_table = dynamodb.Table(os.environ['OVERALL_STANDINGS_TABLE'])
        
        # Initialize shared standings service (no persistent cache for Lambda)
        dynamodb_tables = {
            'league_data': league_data_table,
            'weekly_standings': weekly_standings_table,
            'overall_standings': overall_standings_table
        }
        standings_service = StandingsService(dynamodb_tables, enable_persistent_cache=False)
        
        logger.info(f"Starting historical backfill for league {league_id}")
        
        # Step 1: Get current NFL state to determine completed weeks
        nfl_state = get_nfl_state()
        current_week = nfl_state.get('week', 1)
        season = nfl_state.get('season', '2025')
        
        logger.info(f"NFL State - Season: {season}, Current Week: {current_week}")
        
        # Step 2: Cache league reference data (users, rosters, players)
        cache_league_data(league_id, league_data_table, season)
        
        # Step 3: Process each completed week (weeks 1 through current_week - 1)
        completed_weeks = list(range(1, current_week))  # Don't include current week if in progress
        
        if not completed_weeks:
            logger.info("No completed weeks to backfill")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No completed weeks to backfill',
                    'current_week': current_week
                })
            }
        
        logger.info(f"Backfilling weeks: {completed_weeks}")
        
        # Process each week
        for week in completed_weeks:
            logger.info(f"Processing week {week}")
            
            # Fetch and store matchup data for this week
            matchups = fetch_week_matchups(league_id, week)
            store_week_matchups(league_data_table, season, week, matchups)
            
            # Calculate and store standings directly using shared library
            try:
                weekly_results = standings_service.calculate_and_store(
                    matchups,
                    season, 
                    week,
                    include_player_details=True  # Include full player details for historical processing
                )
                logger.info(f"Processed {len(weekly_results)} teams for week {week}")
            except Exception as e:
                logger.error(f"Failed to calculate standings for week {week}: {e}")
                raise
            
            logger.info(f"Completed week {week}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Historical backfill completed for {len(completed_weeks)} weeks',
                'weeks_processed': completed_weeks,
                'season': season
            })
        }
        
    except Exception as e:
        logger.error(f"Historical backfill error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Historical backfill failed',
                'details': str(e)
            })
        }

def get_nfl_state():
    """Fetch current NFL state from Sleeper API"""
    try:
        response = requests.get('https://api.sleeper.app/v1/state/nfl', timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch NFL state: {e}")
        raise

def cache_league_data(league_id, table, season):
    """Cache users, rosters, and players data in DynamoDB"""
    
    # Cache users
    logger.info("Caching users data...")
    users = fetch_sleeper_data(f'https://api.sleeper.app/v1/league/{league_id}/users')
    for user in users:
        table.put_item(Item=convert_floats_to_decimal({
            'data_type': 'users',
            'id': user['user_id'],
            'season': season,
            'data': user
        }))
    logger.info(f"Cached {len(users)} users")
    
    # Cache rosters
    logger.info("Caching rosters data...")
    rosters = fetch_sleeper_data(f'https://api.sleeper.app/v1/league/{league_id}/rosters')
    for roster in rosters:
        table.put_item(Item=convert_floats_to_decimal({
            'data_type': 'rosters',
            'id': str(roster['roster_id']),
            'season': season,
            'data': roster
        }))
    logger.info(f"Cached {len(rosters)} rosters")
    
    # Cache league info
    logger.info("Caching league info...")
    league_info = fetch_sleeper_data(f'https://api.sleeper.app/v1/league/{league_id}')
    table.put_item(Item=convert_floats_to_decimal({
        'data_type': 'league_info',
        'id': 'league',
        'season': season,
        'data': league_info
    }))
    logger.info("Cached league info")
    
    # Cache players using ff-standings DataCache (delegate to shared logic)
    try:
        # Check if players data already exists
        existing_players = table.get_item(
            Key={'data_type': 'players', 'id': 'nfl_players'}
        )
        
        if 'Item' not in existing_players:
            logger.info("Players data not found, fetching from API handler endpoint...")
            # Delegate to API handler's fetch_players logic to maintain consistency
            # This ensures all player caching uses the same filtered approach
            logger.info("Note: Use API handler's /players endpoint to cache player data")
        else:
            logger.info("Players data already cached, skipping")
    except Exception as e:
        logger.warning(f"Failed to check players data: {e}")
        # Continue without players data for now

def fetch_sleeper_data(url):
    """Fetch data from Sleeper API with error handling"""
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch {url}: {e}")
        raise

def fetch_week_matchups(league_id, week):
    """Fetch matchup data for a specific week"""
    url = f'https://api.sleeper.app/v1/league/{league_id}/matchups/{week}'
    return fetch_sleeper_data(url)

def store_week_matchups(table, season, week, matchups):
    """Store weekly matchup data in DynamoDB"""
    try:
        # Store matchups data for this week
        table.put_item(Item=convert_floats_to_decimal({
            'data_type': 'matchups',
            'id': f'{season}_{week}',
            'season': season,
            'week': week,
            'data': matchups
        }))
        logger.info(f"Stored matchups for week {week}")
    except Exception as e:
        logger.error(f"Failed to store week {week} matchups: {e}")
        raise
