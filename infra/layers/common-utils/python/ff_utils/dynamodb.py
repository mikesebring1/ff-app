"""
DynamoDB utilities for Fantasy Football application.
Shared functions for DynamoDB data type conversion and operations.
"""

import json
from decimal import Decimal


def convert_floats_to_decimal(obj):
    """
    Recursively convert all float values to Decimal for DynamoDB compatibility.
    
    DynamoDB doesn't support float types natively and requires Decimal for 
    precise numerical operations. This function ensures all float values
    in nested data structures are converted to Decimal.
    
    Args:
        obj: The object to convert (can be dict, list, float, or other types)
        
    Returns:
        Object with all float values converted to Decimal
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


class DecimalEncoder(json.JSONEncoder):
    """
    Custom JSON encoder for DynamoDB Decimal types.
    
    When returning data from Lambda functions, Decimal objects need to be
    serialized back to float for JSON compatibility.
    """
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)


def get_cors_headers():
    """
    Standard CORS headers for all API responses.
    
    Returns:
        dict: Standard CORS headers for Fantasy Football API
    """
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
