from pyramid.view import view_config
from lib import event
import os
import eventful
import datetime
import logging
import re
import random
import dill
import functools

log = logging.getLogger(__name__)

api = eventful.API(os.environ['EVENTFUL_KEY'])


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='newevents', renderer='templates/newevents.pt')
def new_events_view(request):
    location = request.matchdict['location']
    today = str(datetime.date.today())

    data = {'location': location, 'today': today, 'request': request}

    events = get_events(**data)
    log.debug('events: %s', events)

    # could not find events in api, empty response
    if not events:
        # TODO: support empty response correctly in the template
        return {
            'events': [],
            'playlist': [],
            'location': location,
            'today': today
        }

    data['events'] = events
    playlist = create_playlist(**data)

    return {
        'events': events,
        'playlist': playlist,
        'location': location,
        'today': today
    }


def cache_data(name):
    '''
    Caches data for playlist and for events
    '''
    def wrapper(f):
        '''
        Caches data on redis
        '''
        @functools.wraps(f)
        def decorated_function(**kwargs):
            request = kwargs['request']

            data_redis_key = "%s.%s.%s" % (
                kwargs['location'], name, kwargs['today'])

            # get data from redis
            data = request.redis.get(data_redis_key)
            data = dill.loads(data) if data else ''

            if data:
                log.debug(
                    'Obtained data from cache for %s', data_redis_key)
                return data

            # find the data
            data = f(**kwargs)

            if data:
                log.debug('Setting data on cache for %s', data_redis_key)
                # and set it on redis
                request.redis.set(data_redis_key, dill.dumps(data))

                return data
        return decorated_function
    return wrapper


@cache_data(name='events')
def get_events(**kwargs):
    # get the events from the eventful api
    events = api.call(
        '/events/search', c='music', l=kwargs['location'], date='This week'
    )

    if (not events or int(events['total_items']) == 0):
        return []

    # simplify them
    return simplify_events(events, kwargs['request'])


def simplify_events(events, request):
    '''
    Simplify the eventful event list
    by instantiating a class for each event with specific data
    '''

    event_list = events['events']['event']

    # eventful api does not respond with list when the result is just one item
    # so we force it to be a list
    if not isinstance(event_list, list):
        event_list = [event_list]

    # create a list with Event objects with the necessary data
    events = []
    for ev in event_list:
        artist_name = ''
        if isinstance(ev['performers'], dict):
            if isinstance(ev['performers']['performer'], dict):
                artist_name = ev['performers']['performer']['name']
            else:
                artist_name = ev['performers']['performer'][0]['name']

        log.debug('Event: %s -> artist: %s', ev['title'], artist_name)

        events.append(event.Event(
            ev['title'], ev['start_time'], ev['venue_name'], artist_name, request.redis))

    return events


@cache_data(name='playlist')
def create_playlist(**kwargs):
    """ Creates a playlist string to be rendered
    """

    events = kwargs['events']
    log.info('create_playlist')

    # retrieve the ids from a random song of each event artist
    ids = [random.choice(
        event.artist.songs).spotify_id for event in events
        if event.artist and event.artist.songs]

    playlist = ','.join(ids)

    # log.info('ids - %s', ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    playlist = pattern.sub('', playlist)

    log.info('playlist - %s', playlist)

    return playlist
