-- Aviator Game Database Schema
-- Use this to set up your MySQL database on Hostinger or other hosting providers.

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `uid` varchar(128) NOT NULL,
  `email` varchar(255) NOT NULL,
  `balance` decimal(20,2) DEFAULT 0.00,
  `referral_balance` decimal(20,2) DEFAULT 0.00,
  `is_admin` tinyint(1) DEFAULT 0,
  `status` enum('active','banned') DEFAULT 'active',
  `referral_code` varchar(50) DEFAULT NULL,
  `referred_by` varchar(128) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`uid`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `referral_code` (`referral_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(50) NOT NULL,
  `config_value` text NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`config_key`, `config_value`) VALUES
('next_crash_value', '2.00'),
('current_upi_id', 'example@upi'),
('current_qr_code', ''),
('deposit_bonus_percentage', '10'),
('game_state', 'waiting'),
('last_final_value', '1.00');

-- --------------------------------------------------------

--
-- Table structure for table `user_bets`
--

CREATE TABLE `user_bets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(128) NOT NULL,
  `amount` decimal(20,2) NOT NULL,
  `multiplier` decimal(10,2) DEFAULT NULL,
  `win_amount` decimal(20,2) DEFAULT 0.00,
  `status` enum('pending','win','lost') DEFAULT 'pending',
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `deposits`
--

CREATE TABLE `deposits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(128) NOT NULL,
  `amount` decimal(20,2) NOT NULL,
  `transaction_id` varchar(255) NOT NULL,
  `proof_url` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `withdrawals`
--

CREATE TABLE `withdrawals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(128) NOT NULL,
  `amount` decimal(20,2) NOT NULL,
  `upi_id` varchar(255) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
