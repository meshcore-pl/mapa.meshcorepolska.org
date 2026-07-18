const router = require('express').Router();

router.get('/', (req, res) => res.render('index'));
router.get('/assets/icons', (req, res) => res.render('icons'));

module.exports = router;
