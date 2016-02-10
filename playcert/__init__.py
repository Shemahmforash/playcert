from pyramid.config import Configurator


def main(global_config, **settings):
    """
    This function returns a Pyramid WSGI application.
    """
    config = Configurator(settings=settings)
    config.include('pyramid_chameleon')
    config.include('pyramid_redis')
    config.add_static_view('static', 'static')
    config.add_static_view('bower_components', 'bower_components')
    # config.add_route('home', '/')
    config.add_route('events', '/events/{location}.json')
    config.add_route('get_city_from_coordinates',
                     '/coordinates/city.json')

    config.add_route('home', '/*subpath')

    config.scan()
    return config.make_wsgi_app()
